/**
 * csv-express:
 * Forked and refactored (without public api changes) by Lawrence Page <lpage2008@gmail.com>
 * Forked and modified by John J Czaplewski <jczaplew@gmail.com>
 * @copyright 2011, 2017
 * @author Seiya Konno <nulltask@gmail.com> (Original Author)
 * @author John J Czaplewski <jczaplew@gmail.com> (Contributor)
 * @author Lawrence Page <lpage2008@gmail.com> (Contributor)
 * @license MIT
 */

'use strict';

var res = require('http').ServerResponse.prototype,
    iconv = require('iconv-lite'),
    LINE_BREAK = '\r\n';

// Configurable settings
exports.separator = ',';
exports.preventCast = false;
exports.ignoreNullOrUndefined = true;

/**
 * Stricter parseFloat to support hexadecimal strings from
 * https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/parseFloat#A_stricter_parse_function
 * @param {Mixed} value
 * @return {Number}
 * @api private
 */
function filterFloat(value) {
  if (/^(\-|\+)?([0-9]+(\.[0-9]+)?|Infinity)$/.test(value)) {
    return Number(value);
  }
  return NaN;
}

/**
 * Helper function for escape function
 *
 * @param {Mixed} field
 * @return {String}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function doReplace(field) {
  return '"' + String(field).replace(/\"/g, '""') + '"';
}

/**
 * Escape CSV field
 *
 * @param {Mixed} field
 * @return {String}
 * @api private
 */
function escape(field) {
  if (exports.ignoreNullOrUndefined && field == undefined) { //jshint ignore:line
    return '';
  }
  if (exports.preventCast) {
    return '=' + doReplace(field);
  }
  if (!isNaN(filterFloat(field)) && isFinite(field)) {
    return parseFloat(field);
  }
  return doReplace(field);
}

/**
 * Get data column headers;
 * Helper function for toCsv function
 *
 * @param {Array} data
 * @return {Array}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function getHeaderRow(data) {
  var row = [],
      head = data[0] || null,
      prop;

  if(!head) { return null; }

  for (prop in head) {
    if (head.hasOwnProperty(prop)) {
      row.push(prop);
    }
  }

  return row;
}

/**
 * Map individual data fields for object-based item;
 * (Curried) Helper function for generateDataRow function
 *
 * @param {Object} item
 * @param {Array} key - curried
 * @return {Array}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function itemMapper(item) {
    return function(key) {
      return item.hasOwnProperty(key) ? item[key] : null;
    };
}

/**
 * Map data row to escaped comma-delimited string;
 * (Curried) Helper function for toCsv function
 *
 * @param {Array} headerRow
 * @param {Mixed} item - curried
 * @return {Array}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function generateDataRow(headerRow) {
  return function(item) {
      if(!headerRow) { return ''; }

      if(!(item instanceof Array)) {
        item = headerRow.map(itemMapper(item));
      }

      return item.map(escape).join(exports.separator);
  };
}

/**
 * Return all data rows as string;
 * Helper function for toCsv function
 *
 * @param {String} acc
 * @param {String} item
 * @return {String}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function generateDataRows(acc, item) {
    return acc += item + LINE_BREAK;
}

/**
 * Convert data array to encoded CSV structure
 *
 * @param {Array} data
 * @param {Boolean} csvHeaders
 * @param {String} charset
 * @return {String}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function toCsv(data, csvHeaders, charset) {
  var headerRow = getHeaderRow(data),
      dataHeader = csvHeaders ? headerRow + LINE_BREAK : '',
      _generateDataRow = generateDataRow(headerRow),
      body = dataHeader + data.map(_generateDataRow).reduce(generateDataRows, '');

  return charset !== 'utf-8' ? iconv.encode(body, charset) : body;
}

/**
 * Determine whether param is an object
 *
 * @param {Mixed} [obj]
 * @return {Boolean}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function isObject(obj) {
  return obj && obj instanceof Object;
}

/**
 * Set custom headers on the response object;
 * assumes caller will set response context
 *
 * @param {Object} headers
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function setHeaders(headers) {
    this.header('Content-Type', 'text/csv'); // jshint ignore:line

    if (isObject(headers)) {
      // Use res.header() instead of res.set() to maintain backward compatibility with Express 2
      // Change to res.set() in next major version so that iteration is not required
      Object.keys(headers).forEach(function(header) {
        this.header(header, headers[header]);
      }.bind(this)); // jshint ignore:line
    }
}

/**
 * Determine whether HTTP status code is valid, if status provided
 *
 * @param {Mixed} [status]
 * @return {Boolean}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function isValidResponseCode(status) {
  return status &&
    Number.isInteger(status) &&
    status >= 200 && status < 600;
}

/**
 * Set HTTP status code;
 * returns true if status code is set, otherwise false;
 * assumes caller will set response context
 *
 * @param {Number} [status]
 * @return {Boolean}
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api private
 */
function setResponseCode(status) {
  if (isValidResponseCode(status)) {
    // res.status does not work in Express 2, so make sure the error would be trapped
    try {
      this.status(status); // jshint ignore:line
    } catch(error) {
      return false;
    }
  }
  return true;
}

/**
 * Send CSV response
 * @param {Array} data - Array objects or arrays
 * @param {Boolean} csvHeaders - If true uses the keys of the objects in {obj} to set a header row
 * @param {Object} [headers] - Optional HTTP response headers
 * @param {Number} [status] - Optional status code
 * @author Lawrence Page <lpage2008@gmail.com>
 * @api public
 */
res.csv = function(data, csvHeaders, headers, status) {
  this.charset = this.charset || 'utf-8';

  var body = toCsv(data, csvHeaders, this.charset);

  setHeaders.call(this, headers);

  if (!setResponseCode.call(this, status)) {
    return this.send(body, status);
  }

  return this.send(body);
};
