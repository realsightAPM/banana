define([
  'angular',
  'underscore',
    'jquery',
    'toastr'
],
function (angular, _) {
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

  module.service('solrSrv', function(dashboard, $http, alertSrv, filterSrv, querySrv,$translate) {
    // Save a reference to this
    var self = this;

    this.MAX_NUM_CALC_FIELDS = 20; // maximum number of fields for calculating top values
    this.topFieldValues = {};

    this.getTopFieldValues = function(field) {
      return self.topFieldValues[field];
    };

    // Calculate each field top 10 values using facet query
    this.calcTopFieldValues = function(fields) {
      // Check if we are calculating too many fields and show warning
      if (fields.length > self.MAX_NUM_CALC_FIELDS) {
        toastr.warning($translate.instant('There are too many fields being calculated for top values'), 'RealsightAPM');
      }
      // Construct Solr query
      var fq = '';
      if (filterSrv.getSolrFq()) {
        fq = '&' + filterSrv.getSolrFq();
      }
      var wt = '&wt=json';
      var facet = '&rows=0&facet=true&facet.limit=10&facet.field=' + fields.join('&facet.field=');
      var query = '/select?' + querySrv.getORquery() + fq + wt + facet;

      // loop through each field to send facet query to Solr
      // _.each(fields, function(field) {
        // var newquery = query + field;
        var request = $http({
          method: 'GET',
          url: dashboard.current.solr.server + dashboard.current.solr.core_name + query,
        }).error(function(data, status) {
          if(status === 0) {
            toastr.error($translate.instant('Could not contact Solr,please ensure that Solr is reachable from your system.'), 'RealsightAPM');
          } else {
            toastr.error($translate.instant('Could not retrieve facet data from Solr'), 'RealsightAPM');
          }
        });

        request.then(function(results) {
          // var topFieldValues = {
          //   counts: [],
          //   totalcount: results.data.response.numFound
          //   // hasArrays: undefined // Not sure what hasArrays does
          // };

          // var facetFields = results.data.facet_counts.facet_fields[field];
          // // Need to parse topFieldValues.counts like this:
          // //   [["new york", 70], ["huntley", 130]]
          // for (var i = 0; i < facetFields.length; i=i+2) {
          //   topFieldValues.counts.push([facetFields[i], facetFields[i+1]]);
          // };

          // self.topFieldValues[field] = topFieldValues;

          var facetFields = results.data.facet_counts.facet_fields;

          _.each(facetFields, function(values, field) {
            var topFieldValues = {
              counts: [],
              totalcount: results.data.response.numFound
              // hasArrays: undefined // Not sure what hasArrays does
            };
            // Need to parse topFieldValues.counts like this:
            //   [["new york", 70], ["huntley", 130]]
            for (var i = 0; i < values.length; i=i+2) {
              topFieldValues.counts.push([values[i], values[i+1]]);
            }

            self.topFieldValues[field] = topFieldValues;
          });

        });
      // }); // each loop
    };

  });
});
