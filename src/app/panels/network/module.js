/*
  ## pies

  ### Parameters
  * style :: A hash of css styles
  * size :: top N
  * arrangement :: How should I arrange the query results? 'horizontal' or 'vertical'
  * chart :: Show a chart? 'none', 'bar', 'pie'
  * donut :: Only applies to 'pie' charts. Punches a hole in the chart for some reason
  * tilt :: Only 'pie' charts. Janky 3D effect. Looks terrible 90% of the time.
  * lables :: Only 'pie' charts. Labels on the pie?
*/
define([
  'angular',
  'app',
  'underscore',
  'jquery',
  'kbn',
  'echarts-liquidfill',
    'echarts-wordcloud'

],
function (angular, app, _, $, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.network', []);
  app.useModule(module);

  module.controller('network', function($scope, $timeout, $translate,timer, querySrv, dashboard, filterSrv) {
    $scope.panelMeta = {
      exportfile: true,
      editorTabs : [
        {title:$translate.instant('Queries'), src:'app/partials/querySelect.html'}
      ],
      status  : "Stable",
      description : ""
    };

    // Set and populate defaults
    var _d = {
      queries     : {
        mode        : 'all',
        ids         : [],
        query       : '*:*',
        custom      : ''
      },
      mode    : 'count', // mode to tell which number will be used to plot the chart.
      field   : '',
      stats_field : '',
      decimal_points : 0, // The number of digits after the decimal point
      exclude : [],
      missing : false,
      other   : false,
      size    : 10000,
      sortBy  : 'count',
      order   : 'descending',
      fontsize   : 12,
      donut   : false,
      tilt    : false,
      display:'block',
      edge:'',
      icon:"icon-caret-down",
      labels  : true,
	  ylabels :true,
      logAxis : false,
      arrangement : 'vertical',
	  RoseType	  : 'area',
      chart       : 'network',
        solrFq :filterSrv.getSolrFq(),
      exportSize : 10000,
        linkage_id:'a',
        value_sort:'rs_timestamp',
        defaulttimestamp:true,
      lastColor : '',
      spyable     : true,
      show_queries:true,
      error : '',
      chartColors : querySrv.colors,
      refresh: {
        enable: false,
        interval: 2
      }
    };
    _.defaults($scope.panel,_d);

    $scope.init = function () {
      $scope.hits = 0;
      //$scope.testMultivalued();

      // Start refresh timer if enabled
      if ($scope.panel.refresh.enable) {
        $scope.set_timer($scope.panel.refresh.interval);
      }

      $scope.$on('refresh',function(){
        $scope.get_data();
      });
      
      $scope.get_data();
    };

    $scope.testMultivalued = function() {
      if($scope.panel.field && $scope.fields.typeList[$scope.panel.field] && $scope.fields.typeList[$scope.panel.field].schema.indexOf("M") > -1) {
        $scope.panel.error = "Can't proceed with Multivalued field";
        return;
      }

      if($scope.panel.stats_field && $scope.fields.typeList[$scope.panel.stats_field].schema.indexOf("M") > -1) {
        $scope.panel.error = "Can't proceed with Multivalued field";
        return;
      }
    };
      $scope.display=function() {
          if($scope.panel.display === 'none'){
              $scope.panel.display='block';
              $scope.panel.icon="icon-caret-down";


          }else{
              $scope.panel.display='none';
              $scope.panel.icon="icon-caret-up";
          }
      };
    /**
     *
     *
     * @param {String} filetype -'json', 'xml', 'csv'
     */
    $scope.build_query = function(filetype, isForExport) {

      // Build Solr query
      var fq = 'fl='+$scope.panel.field+' '+$scope.panel.edge+'&wt=json'+($scope.panel.queries.custom != null ? $scope.panel.queries.custom : '');

      // if (filterSrv.getSolrFq()) {
      //   fq = '&' + filterSrv.getSolrFq();
      //     if(!$scope.panel.defaulttimestamp){
      //         fq = fq.replace(filterSrv.getTimeField(),$scope.panel.value_sort);
      //     }
      // }
      // var wt_json = '&wt=' + filetype;
      // var rows_limit = isForExport ? '&rows=0' : ''; // for pies, we do not need the actual response doc, so set rows=0
      // var facet = '';
      //
      // if ($scope.panel.mode === 'count') {
      //   facet = '&facet=true&facet.field=' + $scope.panel.field + '&facet.limit=' + $scope.panel.size + '&facet.missing=true';
      // } else {
      //   // if mode != 'count' then we need to use stats query
      //   // stats does not support something like facet.limit, so we have to sort and limit the results manually.
      //   facet = '&stats=true&stats.facet=' + $scope.panel.field + '&stats.field=' + $scope.panel.stats_field + '&facet.missing=true';
      // }
      // facet += '&f.' + $scope.panel.field + '.facet.sort=' + ($scope.panel.sortBy || 'count');
      //
      // var exclude_length = $scope.panel.exclude.length;
      // var exclude_filter = '';
      // if(exclude_length > 0){
      //   for (var i = 0; i < exclude_length; i++) {
      //     if($scope.panel.exclude[i] !== "") {
      //       exclude_filter += '&fq=-' + $scope.panel.field +":"+ $scope.panel.exclude[i];
      //     }
      //   }
      // }

      return  fq ;
    };

    $scope.exportfile = function(filetype) {

      var query = this.build_query(filetype, true);

      $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

      var request = $scope.sjs.Request().indices(dashboard.indices),
          response;

      request.setQuery(query);

      response = request.doSearch();

      // Populate scope when we have results
      response.then(function(response) {
        kbn.download_response(response, filetype, "pies");
      });
    };

    $scope.set_timer = function(refresh_interval) {
      $scope.panel.refresh.interval = refresh_interval;
      if (_.isNumber($scope.panel.refresh.interval)) {
        timer.cancel($scope.refresh_timer);
        $scope.realtime();
      } else {
        timer.cancel($scope.refresh_timer);
      }
    };

    $scope.realtime = function() {
      if ($scope.panel.refresh.enable) {
        timer.cancel($scope.refresh_timer);

        $scope.refresh_timer = timer.register($timeout(function() {
          $scope.realtime();
          $scope.get_data();
        }, $scope.panel.refresh.interval*1000));
      } else {
        timer.cancel($scope.refresh_timer);
      }
    };

    $scope.get_data = function() {
        if(($scope.panel.linkage_id === dashboard.current.linkage_id)||dashboard.current.enable_linkage){
        // Make sure we have everything for the request to complete
        if (dashboard.indices.length === 0) {
            return;
        }

        delete $scope.panel.error;
        $scope.panelMeta.loading = true;
        var request, results;

        $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

        request = $scope.sjs.Request().indices(dashboard.indices);
        $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);

        // Populate the inspector panel
        $scope.inspector = angular.toJson(JSON.parse(request.toString()), true);

        var query = this.build_query('json', false);

        // Set the panel's query
        $scope.panel.queries.query = query;

        request.setQuery(query);

        results = request.doSearch();

        // Populate scope when we have results
        results.then(function (results) {
            // Check for error and abort if found
            if (!(_.isUndefined(results.error))) {
                $scope.panel.error = $scope.parse_error(results.error.msg);
                $scope.data = [];
                $scope.label = [];
                $scope.panelMeta.loading = false;
                $scope.$emit('render');
                return;
            }

            // Function for validating HTML color by assign it to a dummy <div id="colorTest">
            // and let the browser do the work of validation.
            /*var isValidHTMLColor = function (color) {
                // clear attr first, before comparison
                $('#colorTest').removeAttr('style');
                var valid = $('#colorTest').css('color');
                $('#colorTest').css('color', color);

                if (valid === $('#colorTest').css('color')) {
                    return false;
                } else {
                    return true;
                }
            };*/

            // Function for customizing chart color by using field values as colors.
            /*
            var addSliceColor = function (slice, color) {
                if ($scope.panel.useColorFromField && isValidHTMLColor(color)) {
                    slice.color = color;
                }
                return slice;
            };
            */

            var y1 =0;

            $scope.panelMeta.loading = false;

            $scope.data = [];
            $scope.label = [];
            $scope.radardata = [];
            $scope.maxdata = 0;
            for(var i1 =0;i1<results.response.docs.length;i1++){
              $scope.label[i1]={id: results.response.docs[i1][$scope.panel.field], label: results.response.docs[i1][$scope.panel.field], shape: 'circle'};
              if(!(_.isUndefined(results.response.docs[i1][$scope.panel.edge]))){
              for(var i2 =0;i2<results.response.docs[i1][$scope.panel.edge].length;i2++){
                $scope.data[y1] ={from: results.response.docs[i1][$scope.panel.edge][i2].split(">")[0], to: results.response.docs[i1][$scope.panel.edge][i2].split(">")[1], arrows:'to', width: 1, length: 200};
                y1++;
              }
              }

            }



            // Sort the results

            // Slice it according to panel.size, and then set the x-axis values with k.
            // $scope.data = $scope.data.slice(0,$scope.panel.size);
            //_.each($scope.data, function(v) {
            // v.data[0][0] = k;
            // k++;
            // });


            // $scope.data.push({label:'Missing field',
            // data:[[k,results.facets.pies.missing]],meta:"missing",color:'#aaa',opacity:0});
            // TODO: Hard coded to 0 for now. Solr faceting does not provide 'missing' value.
            //data:[[k,missing]],meta:"missing",color:'#aaa',opacity:0});
            //  $scope.data.push({label:'Other values',
            // data:[[k+1,results.facets.pies.other]],meta:"other",color:'#444'});
            // TODO: Hard coded to 0 for now. Solr faceting does not provide 'other' value.
            // data:[[k+1,$scope.hits-sum]],meta:"other",color:'#444'});

            $scope.$emit('render');
        });
    }
    };

    $scope.build_search = function(term,negate) {
            if (_.isUndefined(term.meta)) {
                filterSrv.set({
                    type: 'terms', field: $scope.panel.field, value: term.name,
                    mandate: (negate ? 'mustNot' : 'must')
                });
            } else if (term.meta === 'missing') {
                filterSrv.set({
                    type: 'exists', field: $scope.panel.field,
                    mandate: (negate ? 'must' : 'mustNot')
                });
            } else {
                return;
            }
            dashboard.current.linkage_id = $scope.panel.linkage_id;
            dashboard.current.enable_linkage = false;
            dashboard.refresh();

    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
      // if 'count' mode is selected, set decimal_points to zero automatically.
      if ($scope.panel.mode === 'count') {
        $scope.panel.decimal_points = 0;
      }
    };

    $scope.close_edit = function() {
      // Start refresh timer if enabled
      if ($scope.panel.refresh.enable) {
        $scope.set_timer($scope.panel.refresh.interval);
      }

      if ($scope.refresh) {
        // $scope.testMultivalued();
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };

    $scope.showMeta = function(term) {
      if(_.isUndefined(term.meta)) {
        return true;
      }
      if(term.meta === 'other' && !$scope.panel.other) {
        return false;
      }
      if(term.meta === 'missing' && !$scope.panel.missing) {
        return false;
      }
      return true;
    };

  });

  module.directive('networkChart', function(querySrv,dashboard,filterSrv) {
    return {
      restrict: 'A',
      link: function(scope, elem) {
        var myChart;
        // Receive render events
        scope.$on('render',function(){
          render_panel();
        });

        // Re-render if the window is resized
        angular.element(window).bind('resize', function(){
          render_panel();
        });

        // Function for rendering panel
        function render_panel() {
          var colors = [];

          // IE doesn't work without this
            elem.css({height:scope.panel.height||scope.row.height});

          // Make a clone we can operate on.
		  
        

          if (filterSrv.idsByTypeAndField('pies',scope.panel.field).length > 0) {
            colors.push(scope.panel.lastColor);
          } else {
            colors = scope.panel.chartColors;
          }
		 

		
		
          var idd = scope.$id;
          var labelcolor = false;
          if (dashboard.current.style === 'dark'||dashboard.current.style === 'black'){
              labelcolor = true;
          }
                // Add plot to scope so we can build out own legend
          var echarts = require('echarts');
         // require(['vis'], function(nw){
          if(myChart) {
            myChart.dispose();
          }
          if(scope.panel.chart === 'network') {
            var nodes = [
              {id: 'A', label: 'A', shape: 'circle'},
              {id: 'B', label: 'B', shape: 'circle'},
              {id: 'C',  label: 'C',shape: 'circle'},
              {id: 'D', label: 'D', shape: 'circle'},
              {id: 'E',  label: 'E',shape: 'circle'},
              {id: 'F', label: 'F', shape: 'circle'},
            ];

            // create some edges
            var edges = [
              {from: 'A', to: 'B', arrows:'to', width: 1, length: 200}, // individual length definition is possible
              {from: 'A', to: 'C', arrows:'to', width: 1, length: 200},
              {from: 'B', to: 'E', arrows:'to', width: 1, length: 200},
              {from: 'B', to: 'D', arrows:'to', width: 1, length: 200},
              {from: 'D', to: 'A', arrows:'to', width: 1, length: 200},
              {from: 'C', to: 'A', arrows:'to', width: 1, length: 200},
              {from: 'C', to: 'D', arrows:'to', width: 1, length: 200},
              {from: 'D', to: 'F', arrows:'to', width: 1, length: 200},
              {from: 'D', to: 'A', arrows:'to', width: 1, length: 200}
            ];

            // create a network

            var data = {
              nodes: scope.label,
              edges: scope.data
            };
            var options = {};
            var network = new vis.Network(document.getElementById(idd), data, options);

          }


       // });
        }
      }
    };
  });

});
