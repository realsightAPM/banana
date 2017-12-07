define([
  'angular',
  'underscore',
  'config',
    'jquery',
    'toastr'
],
function (angular, _, config) {
  'use strict';
  var toastr = require('toastr');
  toastr.options = {
    closeButton: true,
    progressBar: true,
    showMethod: 'slideDown',
    showEasing: "swing",
    timeOut: 3000
  };
  var module = angular.module('kibana.services');

  module.service('fields', function(dashboard, $rootScope, $http, $translate) {
    // Save a reference to this
    var self = this;

    this.list = ['_type'];
    this.mapping = {};
    this.typeList = {};

    $rootScope.$watch(function(){return dashboard.indices;},function(n) {
      if(!_.isUndefined(n) && n.length) {
        // Only get the mapping for indices we don't know it for
        var indices = _.difference(n,_.keys(self.mapping));
        // Only get the mapping if there are indices
        if(indices.length > 0) {
          self.map(indices).then(function(result) {
            self.mapping = _.extend(self.mapping,result);
            self.list = mapFields(self.mapping);
          });
        // Otherwise just use the cached mapping
        } else {
          self.list = mapFields(_.pick(self.mapping,n));
        }
      }
    });

    var mapFields = function (m) {
      var fields = [];
      _.each(m, function(types) {
        _.each(types, function(v) {
          self.typeList = v;
          fields = _.union(fields,_.keys(v));
        });
      });
      return fields;
    };

    this.map = function () {
      // Check USE_ADMIN_LUKE flag in config.js
      // And also check USE_FUSION flag, if true, use Fusion Collection API instead of Solr.
      var fieldApi = '';
      var request;


      if (config.USE_ADMIN_LUKE) {
        fieldApi = '/admin/luke?numTerms=0&wt=json';
      } else {
        fieldApi = '/schema/fields';
      }

      request = $http({
        url: dashboard.current.solr.server + dashboard.current.solr.core_name + fieldApi,
        method: "GET"
      });


      return request.then(
        function successCallback(response) {
          // this callback will be called asynchronously
          // when the response is available
          var mapping = {};
          // TODO: This hard coded value is just a place holder for extracting fields for the filter list
          var log_index = 'logstash-2999.12.31';
          var logs = 'logs';
          mapping[log_index] = {};
          mapping[log_index][logs] = {};
          var p = response;
          if (config.USE_FUSION) {
            _.each(p, function(v) {
              mapping[log_index][logs][v.name] = {'type': v.type, 'schema': ''};
            });
          } else if (config.USE_ADMIN_LUKE) {
            _.each(p.data.fields, function(v, k) {
              // k is the field name
              mapping[log_index][logs][k] = {'type': v.type, 'schema': v.schema};
            });
          } else {
            _.each(p.data.fields, function(v) {
              mapping[log_index][logs][v.name] = {'type': v.type, 'schema': ''};
            });
          }
          return mapping;
        },
        function errorCallback(response) {
          // called asynchronously if an error occurs
          // or server returns response with an error status.
          if (response.status === 0) {
            toastr.error($translate.instant('Could not contact Solr,please ensure that Solr is reachable from your system.'), 'RealsightAPM');
          } else {
            toastr.error($translate.instant('Collection not found at Solr'), 'RealsightAPM');
          }
        }
      );
    };
    // I don't use this function for Solr.
    var flatten = function(obj,prefix) {
      var propName = (prefix) ? prefix :  '',
        dot = (prefix) ? '.':'',
        ret = {};
      for(var attr in obj){
        // For now only support multi field on the top level
        // and if if there is a default field set.
        if(obj[attr]['type'] === 'multi_field') {
          ret[attr] = obj[attr]['fields'][attr] || obj[attr];
          continue;
        }
        if (attr === 'properties') {
          _.extend(ret,flatten(obj[attr], propName));
        } else if(typeof obj[attr] === 'object'){
          _.extend(ret,flatten(obj[attr], propName + dot + attr));
        } else {
          ret[propName] = obj;
        }
      }
      return ret;
    };

  });

});
