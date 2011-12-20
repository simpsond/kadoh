// Greatly inspired from :
// Some easier XML-RPC methods for Mozilla.
// 12/7/2005, 26/12/2005, 6/1/2006 David Murray.
// http://deepestsender.mozdev.org/
// v0.3
// @see http://code.google.com/p/qpanel/source/browse/trunk/src/client/lib/xmlrpc.js

// Dep: [KadOH]/globals

(function(exports) {
  
  var KadOH = exports;

  var XMLRPC_ERROR_STRINGS = {
    '-32700' : 'Parse error.',
    '-32600' : 'Invalid Request.',
    '-32601' : 'Method not found.',
    '-32602' : 'Invalid params.',
    '-32603' : 'Internal error.'
  };
 
  var _convertToXML = function(obj) {
    var xml = document.implementation.createDocument('', 'tempdoc', null);
    var findtype = new RegExp('function (.*?)\\(\\) \\{.*');
    var value, numtype;
    switch (findtype.exec(obj.constructor.toString())[1]) {
      case 'Number':
        // Numbers can only be sent as integers or doubles.
        if (Math.floor(obj) !== obj) {
          numtype = xml.createElement('double');
        } else {
          numtype = xml.createElement('i4');
        }
        var number = xml.documentElement.appendChild(numtype);
        number.appendChild(xml.createTextNode(obj));
        break;
      case 'String':
        var string = xml.documentElement.appendChild(xml.createElement('string'));
        string.appendChild(xml.createTextNode(obj));
        break;
      case 'Boolean':
        var bool = xml.documentElement.appendChild(xml.createElement('boolean'));
        bool.appendChild(xml.createTextNode(obj * 1));
        break;
      case 'Object':
        var struct = xml.documentElement.appendChild(xml.createElement('struct'));
        for (var w in obj) {
          if(typeof obj[y] === 'function')
            continue;
          var member = struct.appendChild(xml.createElement('member'));
          var membername = member.appendChild(xml.createElement('name'));
          membername.appendChild(xml.createTextNode(w));
          value = member.appendChild(xml.createElement('value'));
          value.appendChild(_convertToXML(obj[w]));
        }
        break;
      case 'Date':
        var date = xml.documentElement.appendChild(xml.createElement('dateTime.iso8601'));
        var datetext = obj.getFullYear() + _padNumber(obj.getMonth() + 1) + _padNumber(obj.getDate()) + 'T' + _padNumber(obj.getHours()) + ':' + _padNumber(obj.getMinutes()) + ':' + _padNumber(obj.getSeconds());
        date.appendChild(xml.createTextNode(datetext));
        break;
      case 'Array':
        var array = xml.documentElement.appendChild(xml.createElement('array'));
        var data = array.appendChild(xml.createElement('data'));
        for (var y in obj) {
          if(typeof obj[y] === 'function')
            continue;
          value = data.appendChild(xml.createElement('value'));
          value.appendChild(_convertToXML(obj[y]));
        }
        break;
      default:
        // Hellishly awful binary encoding shit goes here.
        // GZiped base64
        // @TODO
        break;
    }
    return xml.documentElement.firstChild;
  };

  var _padNumber = function(num) {
    if (num < 10) {
      num = '0' + num;
    }
    return num;
  };

  var _removeWhiteSpace = function(node) {
    var notWhitespace = /\S/;
    for (var x = 0; x < node.childNodes.length; x++) {
      var childNode = node.childNodes[x];
      if ((childNode.nodeType === 3) && (!notWhitespace.test(childNode.textContent))) {
        // that is, if it's a whitespace text node
        node.removeChild(node.childNodes[x]);
        x--;
      }
      if (childNode.nodeType === 1) {
        // elements can have text child nodes of their own
        _removeWhiteSpace(childNode);
      }
    }
  };

  var _convertFromXML = function(obj) {
    var data;
    var tag = obj.tagName;

    if (!obj || 'string' !== typeof tag)
      return null;

    switch (tag) {
      case 'value':
        return _convertFromXML(obj.firstChild);
      case 'double':
      case 'i4':
      case 'int':
        var number = obj.textContent;
        data = number * 1;
        break;
      case 'boolean':
        var bool = obj.textContent;
        if ((bool === 'true') || (bool === '1')) {
          data = true;
        } else {
          data = false;
        }
        break;
      case 'dateTime.iso8601':
        var date = obj.textContent;
        data = new Date();
        data.setFullYear(date.substring(0,4), date.substring(4,6) - 1, date.substring(6,8));
        data.setHours(date.substring(9,11), date.substring(12,14), date.substring(15,17));
        break;
      case 'array':
        data = [];
        var datatag = obj.firstChild;
        for (var k = 0; k < datatag.childNodes.length; k++) {
          var value = datatag.childNodes[k];
          data.push(_convertFromXML(value.firstChild));
        }
        break;
      case 'struct':
        data = {};
        for (var j = 0; j < obj.childNodes.length; j++) {
          var membername = obj.childNodes[j].getElementsByTagName('name')[0].textContent;
          var membervalue = obj.childNodes[j].getElementsByTagName('value')[0].firstChild;
          if (membervalue) {
            data[membername] = _convertFromXML(membervalue);
          } else {
            data[membername] = null;
          }
        }
        break;
      default:
      case 'string':
        data = obj.textContent;
        break;
    }
    return data;
  };

  var parseRPCMessage = function(iq) {
    debugger;
    if ('string' === typeof iq) {
      iq = new DOMParser().parseFromString(iq, 'text/xml');
      _removeWhiteSpace(iq);
      if (iq.getElementsByTagName('parsererror').length > 0)
        throw new RPCError(-32600);
    }

    var id, query, type, obj;
    try {
      id   = iq.getAttribute('id');
      raw  = iq.getElementsByTagName('query')[0].firstChild;
      type = raw.tagName;
      obj  = {};
    }
    catch(e) {
      throw new RPCError(-32600);
    }

    obj.id = id || null;

    if (type === 'methodCall') {
      var method = raw.getElementsByTagName('methodName')[0];
      
      if (!method)
        throw new RPCError(-32600, null, {id : obj.id});
      
      var methodname = method.textContent;
      if (typeof RPCS !== 'undefined' && RPCS.indexOf(methodname) === -1)
        throw new RPCError(-32601, null, {id : obj.id});
      
      //OK
      obj.method = methodname;
      
      //validate params
      var params = raw.getElementsByTagName('params')[0];
      params = params ? params.getElementsByTagName('param') : null;
      if (params && params.length > 0) {
        obj.params = [];
        var param;
        for (var i = 0; i < params.length; i++) {
          param = _convertFromXML(params[i].firstChild);
          if (param)
            obj.params.push(param);
        }
      } else {
        obj.params = [];
      }
      return new RPCMessage(obj, raw);
    }
    else if (type === 'methodResponse') {
      var result = raw.firstChild;
      var value  = result.firstChild;
      if (result.tagName === 'params') {
        obj.result = value ? _convertFromXML(value) : null;
      }
      else if (result.tagName === 'fault') {
        var fault = _convertFromXML(result.firstChild);

        if (!fault || !fault.faultCode || !fault.faultString)
          throw new RPCError(-32600, null, {id : obj.id});
        
        obj.error = new RPCError(fault.faultCode, fault.faultString, {id : obj.id});
      }
      return new RPCMessage(obj, raw);
    }
    else {
      throw new RPCError(-32600);
    }
  };

  var buildRequest = function(methodname, params, id) {
    id     = id ? String(id) : '';
    params = params || [];
    params = Array.isArray(params) ? params : [params];

    var xml = document.implementation.createDocument('', 'methodCall', null);
    xml.documentElement.appendChild(xml.createElement('methodName'))
                       .appendChild(xml.createTextNode(methodname));
    
    var xmlparams = xml.documentElement.appendChild(xml.createElement('params'));
    for (var i = 0; i < params.length; i++) {
      var param = xmlparams.appendChild(xml.createElement('param'));
      var value = param.appendChild(xml.createElement('value'));
      value.appendChild(_convertToXML(params[i]));
    }
    
    return new RPCMessage({
      id: id,
      method: methodname,
      params: params
    } ,xml);
  };

  var buildResponse = function(result, id) {
    id = id ? String(id) : '';
    var xml = document.implementation.createDocument('', 'methodResponse', null);
    xml.documentElement.appendChild(xml.createElement('params'))
                       .appendChild(xml.createElement('param'))
                       .appendChild(_convertToXML(result));

    return new RPCMessage({
      id: id,
      result: result
    }, xml);
  };

  var buildErrorResponse = function(error, id) {
    var obj = {};
    obj.error = error;
    if (id) {
      obj.id = String(id);
      if (typeof obj.error.data !== 'undefined')
        delete obj.error.data.id;
    } else {
      if (typeof error.hasRPCID !== 'undefined' && error.hasRPCID())
        obj.id = String(error.getRPCID());
    }

    var xml = document.implementation.createDocument('', 'methodResponse', null);
    var struct = xml.documentElement.appendChild(xml.createElement('fault'))
                                    .appendChild(xml.createElement('value'))
                                    .appendChild(xml.createElement('struct'));
    var faultCode = struct.appendChild(xml.createElement('member'));
    faultCode.appendChild(xml.createElement('name')).appendChild(xml.createTextNode('faultCode'));
    faultCode.appendChild(_convertToXML(error.code));
    var faultString = struct.appendChild(xml.createElement('member'));
    faultCode.appendChild(xml.createElement('name')).appendChild(xml.createTextNode('faultString'));
    faultCode.appendChild(_convertToXML(error.message));

    return new RPCMessage(obj, xml);
  };

  var buildInternalRPCError = function(data) {
    return new RPCError(-32603, undefined, data); 
  };

  /**
   * A RPC message object.
   * 
   * @name RPCMessage
   * @class <i>Namespace</i> : KadOH.protocol.xmlrpc._RPCMessage
   * @param {object} Raw parsed XML RPC message object.
   */  
  var RPCMessage = function(obj, xml) {
    _clone(this, obj);
    this._xml = xml;
  };

  RPCMessage.prototype =  {
    /**
     * Setter for the RPC ID.
     * @param {String} id The id to set
     * @return {RPCMessage} Chainable object.
     */
    setRPCID  : function(id) {this.id = String(id); return this;            },
    /**
     * Getter for the RPC ID.
     * @public
     * @return {String} RPC ID.
     */
    getRPCID  : function() {  return this.id;                               },
    /**
     * @public
     * @return {Boolean} True if RPCMessage is a response.
     */
    isResponse: function() {  return ('undefined' !== typeof this.result);  },
    /**
     * @public
     * @return {Object|String|Number} The result of the RPC reponse message.
     */
    getResult : function() {  return this.result;                           },
    /**
     * @public
     * @return {Boolean} True if RPC message is a request.
     */
    isRequest : function() {  return ('undefined' !== typeof this.method);  },
    /**
     * @public
     * @return {String} Method invoked by the RPC message.
     */
    getMethod : function() {  return this.method;                           },
    /**
     * @public
     * @return {*} Return the parameters passed in a RPC message.
     */
    getParams : function() {  return this.params;                           },
    /**
     * @public
     * @return {Boolean} True if RPCMessage is an error message.
     */
    isError   : function() {  return ('undefined' !== typeof this.error);   },
    /**
     * @public
     * @return {Object} The error object contained in message.
     */
    getError  : function() {  return this.error;                            },
    /**
     * @public
     * @return {'response'|'request'|'error'} Type of RPCMessage
     */
    getType   : function() {  if (this.isResponse()) return 'response';
                              if (this.isRequest())  return 'request';
                              if (this.isError())    return 'error';         },
    /**
     * @public
     * @return {Object} Raw rpc message object.
     */
    stringify : function() {
      return this._xml.documentElement;
    }
  };

  /**
   * RPC error object.
   * In the data arguments object, it can be passed as property the ID of the related RPCMessage.
   * 
   * @name RPCError
   * @class <i>Namespace</i> : KadOH.protocol.xmlrpc._RPCMessage
   * @param {Number} code    XML RPC error code.
   * @param {String} [message] Description of the error.
   * @param {Object} [data]    Optionnal complementary data about error.
   */  
  var RPCError = function(code, message, data) {
    this.code =  code;
    this.message = message ? message : (XMLRPC_ERROR_STRINGS[code] ? XMLRPC_ERROR_STRINGS[code] : '');
    if (data !== undefined && data !== null)
      this.data = data;
  };
  RPCError.prototype = {
    /**
     * @return {Boolean} True if a id is present in the data object.
     */
    hasRPCID : function() {
      return ('undefined' !== typeof this.data) && (('undefined' !== typeof this.data.id));
    },
    /**
     * @return {String} The RPC id in the data object.
     */
    getRPCID : function() {
      if (this.hasRPCID()) return this.data.id;
    },
    /**
     * @return {Object} Raw error message object.
     */
    stringify : function() {
      return _clone({}, this);
    }
  };

  KadOH.protocol = KadOH.protocol || {};
  KadOH.protocol.xmlrpc = {
    parseRPCMessage       : parseRPCMessage,
    buildRequest          : buildRequest,
    buildResponse         : buildResponse,
    buildErrorResponse    : buildErrorResponse,
    buildInternalRPCError : buildInternalRPCError, 
    RPCMessage            : RPCMessage,
    RPCError              : RPCError,
    XMLRPC_ERROR_STRINGS  : XMLRPC_ERROR_STRINGS
  };
  
  var _clone = function(clone, obj) {
    if (null === obj || 'object' !== typeof obj)
      return {};
    for (var attr in obj) {
      if (obj.hasOwnProperty(attr)) clone[attr] = obj[attr];
    }
    return clone;
  };

})('object' === typeof module ? module.exports : (this.KadOH = this.KadOH || {}));