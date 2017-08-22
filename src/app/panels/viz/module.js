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
  'kbn'

],
function (angular, app, _, $, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.pies', []);
  app.useModule(module);

  module.controller('viz', function($scope, $timeout, $translate,timer, querySrv, dashboard, filterSrv) {
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
      showlabel:true,
      dragging:false,
      physics:false,
      icon:"icon-caret-down",
      labels  : true,
	  ylabels :true,
      options:false,
      logAxis : false,
      arrangement : 'vertical',
	  RoseType	  : 'area',
      chart       : 'pie',
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
      $scope.options = false;
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
      var fq = '';

      if (filterSrv.getSolrFq()) {
        fq = '&' + filterSrv.getSolrFq();
          if(!$scope.panel.defaulttimestamp){
              fq = fq.replace(filterSrv.getTimeField(),$scope.panel.value_sort);
          }
      }
      var wt_json = '&wt=' + filetype;
      var rows_limit = isForExport ? '&rows=0' : ''; // for pies, we do not need the actual response doc, so set rows=0
      var facet = '';

      if ($scope.panel.mode === 'count') {
        facet = '&facet=true&facet.field=' + $scope.panel.field + '&facet.limit=' + $scope.panel.size + '&facet.missing=true';
      } else {
        // if mode != 'count' then we need to use stats query
        // stats does not support something like facet.limit, so we have to sort and limit the results manually.
        facet = '&stats=true&stats.facet=' + $scope.panel.field + '&stats.field=' + $scope.panel.stats_field + '&facet.missing=true';
      }
      facet += '&f.' + $scope.panel.field + '.facet.sort=' + ($scope.panel.sortBy || 'count');

      var exclude_length = $scope.panel.exclude.length;
      var exclude_filter = '';
      if(exclude_length > 0){
        for (var i = 0; i < exclude_length; i++) {
          if($scope.panel.exclude[i] !== "") {
            exclude_filter += '&fq=-' + $scope.panel.field +":"+ $scope.panel.exclude[i];
          }
        }
      }

      return querySrv.getORquery() + wt_json + rows_limit + fq + exclude_filter + facet + ($scope.panel.queries.custom != null ? $scope.panel.queries.custom : '');
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


    $scope.allowDraggingOfNodes = function(){
      $scope.viz.setOptions({showLabels:$scope.panel.showlabel,allowDraggingOfNodes:$scope.panel.dragging});
    };
    $scope.setPhysicsOption = function(){
      $scope.viz.setPhysicsOptions({isEnabled:$scope.panel.physics});
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

            var sum = 0;
            var k = 0;
            var missing = 0;
            $scope.panelMeta.loading = false;
            $scope.hits = results.response.numFound;
            $scope.data = [];
            $scope.label = [];
            $scope.radardata = [];
            $scope.maxdata = 0;


            if ($scope.panel.mode === 'count') {
                // In count mode, the y-axis min should be zero because count value cannot be negative.
                $scope.yaxis_min = 0;

                _.each(results.facet_counts.facet_fields, function (v) {
                    for (var i = 0; i < v.length; i++) {
                        var term = v[i];
                        i++;
                        var count = v[i];

                        sum += count;
                        if (term === null) {
                            missing = count;
                        } else {
                            if ($scope.maxdata < count) {
                                $scope.maxdata = count;
                            }
                            // if count = 0, do not add it to the chart, just skip it
                            if (count === 0) {
                                continue;
                            }
                            term = term.replace(/[\r\n]/g, "");

                            var slice = {value: count, name: term};
                            $scope.label.push(term);
                            $scope.data.push(slice);
                            $scope.radardata.push(count);
                        }
                    }
                });
            } else {
                // In stats mode, set y-axis min to null so jquery.flot will set the scale automatically.
                $scope.yaxis_min = null;
                _.each(results.stats.stats_fields[$scope.panel.stats_field].facets[$scope.panel.field], function (stats_obj, facet_field) {
                    var slice = {label: facet_field, data: [[k, stats_obj[$scope.panel.mode]]], actions: true};
                    $scope.data.push(slice);
                });
            }
            // Sort the results
            $scope.data = _.sortBy($scope.data, function (d) {
                return $scope.panel.sortBy === 'index' ? d.name : d.value;
            });
            if ($scope.panel.order === 'descending') {
                $scope.data.reverse();
                $scope.label.reverse();
                $scope.radardata.reverse();
            }

            // Slice it according to panel.size, and then set the x-axis values with k.
            // $scope.data = $scope.data.slice(0,$scope.panel.size);
            //_.each($scope.data, function(v) {
            // v.data[0][0] = k;
            // k++;
            // });

            if ($scope.panel.field && $scope.fields.typeList[$scope.panel.field] && $scope.fields.typeList[$scope.panel.field].schema.indexOf("T") > -1) {
                $scope.hits = sum;
            }

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

  module.directive('vizChart', function(querySrv,dashboard,filterSrv) {
    return {
      restrict: 'A',
      link: function(scope, elem) {

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
          var canvas = document.createElement("canvas");
          canvas.width  = elem.parent().width();
          canvas.height =parseInt(scope.panel.height);
          document.getElementById(idd).appendChild(canvas);
          //scope.
          scope.viz = new Vizceral.default(canvas);

          // Add plot to scope so we can build out own legend
          //var Vizceral = require('vizceral');

          var vizdata = {
            "renderer": "global",
            "name": "edge",
            "nodes": [
              {
                "renderer": "region",
                "name": "INTERNET",
                "displayName": "总线",
                "nodes": [],
                "metadata": {},
                "class": "normal",
                "connections": []
              },
              {
                "renderer": "region",
                "name": "us-east-1",
                "displayName": "Server2",
                "updated": 1477690448572,
                "nodes": [
                  {
                    "name": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "tetrabrach",
                        "metrics": {
                          "normal": 41515.944,
                          "danger": 66.144
                        }
                      },
                      {
                        "name": "colloidal",
                        "metrics": {
                          "danger": 0.166,
                          "normal": 126.34000000000002
                        }
                      },
                      {
                        "name": "wardrobers"
                      },
                      {
                        "name": "yplast"
                      },
                      {
                        "name": "benet",
                        "metrics": {
                          "danger": 0.22400000000000003,
                          "normal": 130.17600000000002
                        }
                      },
                      {
                        "name": "imping",
                        "metrics": {
                          "danger": 0.22000000000000003,
                          "normal": 130.19000000000003
                        }
                      },
                      {
                        "name": "virility",
                        "metrics": {
                          "danger": 0.18600000000000003,
                          "normal": 130.158
                        }
                      },
                      {
                        "name": "eng",
                        "metrics": {
                          "danger": 0.244,
                          "normal": 129.494
                        }
                      },
                      {
                        "name": "use",
                        "metrics": {
                          "danger": 0.2,
                          "normal": 126.536
                        }
                      },
                      {
                        "name": "racegoings",
                        "metrics": {
                          "danger": 0.06999999999999999,
                          "normal": 43.19200000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "amperzands",
                        "metrics": {
                          "danger": 0.006,
                          "normal": 18187.73
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "EAS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "blamer",
                        "metrics": {
                          "danger": 4.220000000000001,
                          "normal": 12450.862000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "农行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "jumbies",
                        "metrics": {
                          "danger": 9429.436,
                          "normal": 124.54400000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "prefocuses",
                        "metrics": {
                          "danger": 1,
                          "normal": 7877.054
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "difference",
                        "metrics": {
                          "normal": 6652.246000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "nymphae",
                        "metrics": {
                          "normal": 4804.088,
                          "danger": 0.264
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "decreasingly",
                        "metrics": {
                          "normal": 3919.876
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "智模",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "reformings",
                        "metrics": {
                          "danger": 0.036,
                          "normal": 3147.704
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "unaligned",
                        "metrics": {
                          "normal": 3954.196
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "EPPOS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "tsesarevich",
                        "metrics": {
                          "danger": 2095.25,
                          "normal": 146.374
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "hoarded",
                        "metrics": {
                          "normal": 4063.334
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "lanterning",
                        "metrics": {
                          "danger": 0.18000000000000002,
                          "normal": 4572.996
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "KAD",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "fructiferous",
                        "metrics": {
                          "normal": 1918.0560000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "青岛银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "langered",
                        "metrics": {
                          "danger": 0.03,
                          "normal": 1853.6560000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "平安银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "undercapitalize",
                        "metrics": {
                          "normal": 1786.8860000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "LIMS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "launches",
                        "metrics": {
                          "normal": 1809.534
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "epistolised",
                        "metrics": {
                          "danger": 1.234,
                          "normal": 3651.6760000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "salix",
                        "metrics": {
                          "normal": 38.160000000000004
                        }
                      },
                      {
                        "name": "ossifrage",
                        "metrics": {
                          "normal": 38.142
                        }
                      },
                      {
                        "name": "incandesce",
                        "metrics": {
                          "normal": 1526.7520000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "modernised",
                        "metrics": {
                          "danger": 12.940000000000001,
                          "normal": 2329.168
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "thewiest",
                        "metrics": {
                          "normal": 1159.382
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "unapproachabilities",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "shikari",
                        "metrics": {
                          "normal": 1110.976
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "arabesk",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "villous",
                        "metrics": {
                          "danger": 0.03,
                          "normal": 976.5799999999999
                        }
                      },
                      {
                        "name": "silvan",
                        "metrics": {
                          "normal": 24.682000000000002
                        }
                      },
                      {
                        "name": "yechs",
                        "metrics": {
                          "normal": 24.974000000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "mispricing",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "pleas",
                        "metrics": {
                          "danger": 0.022000000000000002,
                          "normal": 828.868
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "astones",
                        "metrics": {
                          "normal": 6.038
                        }
                      },
                      {
                        "name": "blamelessnesses",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 1092.528
                        }
                      },
                      {
                        "name": "grouched",
                        "metrics": {
                          "normal": 6.038
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "dogships",
                        "metrics": {
                          "normal": 926.2660000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "metrifier",
                        "metrics": {
                          "normal": 692.9520000000001,
                          "danger": 0.06999999999999999
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "legwork",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "coho",
                        "metrics": {
                          "danger": 0.008,
                          "normal": 635.724
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "flamethrowers",
                        "metrics": {
                          "normal": 540.194
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "garnishes",
                        "metrics": {
                          "danger": 0.05,
                          "normal": 1264.71
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "profulgent",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "cockieleekies",
                        "metrics": {
                          "normal": 1078.5700000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "invulnerableness",
                        "metrics": {
                          "normal": 429.798
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "rehabbed",
                        "metrics": {
                          "normal": 204.92
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "slimy",
                        "metrics": {
                          "danger": 39.67400000000001,
                          "normal": 443.384
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "powhiris",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 527.11
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "prickliest",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "lampadary",
                        "metrics": {
                          "normal": 287.28200000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "imbalmers",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "imposthumated",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 292.37800000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "blastodiscs",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "tawiest",
                        "metrics": {
                          "normal": 286.03200000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "pashed",
                        "metrics": {
                          "normal": 283.108
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "multiracialisms",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "cauterises",
                        "metrics": {
                          "danger": 1.9000000000000001,
                          "normal": 289.13000000000005
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "cylindricalness",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "steen",
                        "metrics": {
                          "danger": 6.188000000000001,
                          "normal": 182.4
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "compellation",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "malleolar",
                        "metrics": {
                          "normal": 34.352,
                          "danger": 153.10999999999999
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "microparasites",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "ribbonwoods",
                        "metrics": {
                          "danger": 1.5460000000000003,
                          "normal": 848.7139999999999
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "remit",
                        "metrics": {
                          "normal": 185.476
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "gimmes",
                        "metrics": {
                          "normal": 180.044
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "alignment",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "madronos",
                        "metrics": {
                          "normal": 156.94000000000003,
                          "danger": 0.006
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "methadone",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "fraicheurs",
                        "metrics": {
                          "danger": 0.020000000000000004,
                          "normal": 130.428
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "remarkableness",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "hydrocortisones",
                        "metrics": {
                          "danger": 0.21600000000000003,
                          "normal": 110.20400000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "reoxidize",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "trapan",
                        "metrics": {
                          "normal": 99.77600000000001,
                          "danger": 4.946000000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "salvability",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "belons",
                        "metrics": {
                          "danger": 0.148,
                          "normal": 97.73200000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "playlisted",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "karroos",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "kitschified",
                        "metrics": {
                          "danger": 0.8340000000000001,
                          "normal": 80.06
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "disfranchise",
                        "metrics": {
                          "normal": 72.478,
                          "danger": 20.21
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "espiers",
                        "metrics": {
                          "danger": 0.654,
                          "normal": 62.326
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "lycee",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "cybersquattings",
                        "metrics": {
                          "normal": 62.026
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "versionings",
                        "metrics": {
                          "normal": 60.43600000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "unacquainted",
                        "metrics": {
                          "danger": 0.014000000000000002,
                          "normal": 972.9639999999999
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "nicompoops",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "metabolised",
                        "metrics": {
                          "danger": 2.068,
                          "normal": 41.752
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "corfhouses",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "anthoid",
                        "metrics": {
                          "normal": 0.22200000000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "overdosed",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "localizable",
                        "metrics": {
                          "normal": 0.638
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "rummlegumptions",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "misprinting",
                        "metrics": {
                          "danger": 0.014000000000000002,
                          "normal": 121.306
                        }
                      },
                      {
                        "name": "revoiced",
                        "metrics": {
                          "normal": 4.332
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "precited",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "radiations",
                        "metrics": {}
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "previsionary",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "sklenting",
                        "metrics": {
                          "danger": 0.6240000000000001,
                          "normal": 22.904
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "kaoliangs",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "allographs",
                        "metrics": {
                          "normal": 22.882
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "bypath",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "hydroxyureas",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "turms",
                        "metrics": {
                          "normal": 18.126
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "gradine",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "smirches",
                        "metrics": {
                          "normal": 12.21
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "atma",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "palpebrae",
                        "metrics": {
                          "normal": 433.92600000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "cleavage",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "rezzes"
                      },
                      {
                        "name": "montre",
                        "metrics": {
                          "normal": 105.25999999999999
                        }
                      },
                      {
                        "name": "alibis",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 105.17200000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "appropriable",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "talkathon",
                        "metrics": {
                          "normal": 613.17,
                          "danger": 0.006
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "name": "INTERNET",
                    "renderer": "focusedChild"
                  }
                ],
                "connections": [
                  {
                    "source": "INTERNET",
                    "target": "proxy-prod",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 97.98200000000001,
                      "normal": 32456.61
                    }
                  },
                  {
                    "source": "INTERNET",
                    "target": "EAS",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 18.094,
                      "normal": 11850.946000000002
                    }
                  },
                  {
                    "source": "INTERNET",
                    "target": "proxy-log",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "warning": 0.006,
                      "danger": 1.218,
                      "normal": 8232.9
                    }
                  },
                  {
                    "source": "YSL",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.022000000000000002,
                      "normal": 117.234
                    }
                  },
                  {
                    "source": "accounts",
                    "target": "salvability",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.288,
                      "normal": 71.542
                    }
                  },
                  {
                    "source": "accounts",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 74.566
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "nicompoops",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 41.47
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "playlisted",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 94.49000000000001
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "precited",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 37.038000000000004
                    }
                  },
                  {
                    "source": "unapproachabilities",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.028000000000000004,
                      "normal": 133.47
                    }
                  },
                  {
                    "source": "unapproachabilities",
                    "target": "cylindricalness",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.1340000000000001,
                      "normal": 183.386
                    }
                  },
                  {
                    "source": "unapproachabilities",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.016,
                      "normal": 10.14
                    }
                  },
                  {
                    "source": "农行",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 27.386000000000003
                    }
                  },
                  {
                    "source": "农行",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.016,
                      "normal": 11.846
                    }
                  },
                  {
                    "source": "农行",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 43.642,
                      "normal": 7428.756
                    }
                  },
                  {
                    "source": "农行",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 29.874000000000002,
                      "normal": 1947.2400000000002
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 13.984000000000002
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 134.15
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 105.06600000000002,
                      "danger": 0.006
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.05600000000000001,
                      "normal": 178.37400000000002
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 655.186
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "rummlegumptions",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.256,
                      "normal": 32.978
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "overdosed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.256,
                      "normal": 32.978
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "corfhouses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.256,
                      "normal": 32.978
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.118,
                      "normal": 109.57600000000001
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "multiracialisms",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.066,
                      "normal": 11.408000000000001
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 7.202
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 1017.616
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.9720000000000001,
                      "normal": 160.19000000000003
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 3.814,
                      "normal": 634.038
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 2.064,
                      "normal": 87.34
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 244.97600000000003
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "rummlegumptions",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.054000000000000006,
                      "normal": 6.184000000000001
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "overdosed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.054000000000000006,
                      "normal": 6.184000000000001
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "corfhouses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.054000000000000006,
                      "normal": 6.184000000000001
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 7.18,
                      "normal": 1576.49
                    }
                  },
                  {
                    "source": "karroos",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 19.136000000000003
                    }
                  },
                  {
                    "source": "karroos",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.022000000000000002,
                      "normal": 19.558000000000003
                    }
                  },
                  {
                    "source": "karroos",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 19.632
                    }
                  },
                  {
                    "source": "cylindricalness",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 69.866
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.024,
                      "normal": 152.236
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 12.118000000000002
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 12.094000000000001
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 3.7460000000000004,
                      "normal": 483.74600000000004
                    }
                  },
                  {
                    "source": "atma",
                    "target": "hydroxyureas",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 11.316
                    }
                  },
                  {
                    "source": "atma",
                    "target": "bypath",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.08600000000000001,
                      "normal": 20.008000000000003
                    }
                  },
                  {
                    "source": "atma",
                    "target": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 441.646
                    }
                  },
                  {
                    "source": "atma",
                    "target": "profulgent",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.022000000000000002,
                      "normal": 423.578
                    }
                  },
                  {
                    "source": "atma",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.978,
                      "normal": 422.79600000000005
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 212.75400000000002
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 212.75400000000002
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 29.962000000000003
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "kaoliangs",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 21.488
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "lycee",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 59.08
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 16.512,
                      "danger": 0.002
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 38.32
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.03,
                      "normal": 26.060000000000002
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 21.996000000000002
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 29.468000000000004
                    }
                  },
                  {
                    "source": "hydroxyureas",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 6.998000000000001
                    }
                  },
                  {
                    "source": "hydroxyureas",
                    "target": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.038000000000000006,
                      "normal": 13.176
                    }
                  },
                  {
                    "source": "hydroxyureas",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.084,
                      "normal": 11.338000000000001
                    }
                  },
                  {
                    "source": "hydroxyureas",
                    "target": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 8.328000000000001
                    }
                  },
                  {
                    "source": "ZH",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.036,
                      "normal": 165.91
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.028000000000000004,
                      "normal": 94.644
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 42.330000000000005
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "salvability",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 13.772
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 58.394000000000005
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 18.84
                    }
                  },
                  {
                    "source": "salvability",
                    "target": "reoxidize",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.10200000000000001,
                      "normal": 94.808
                    }
                  },
                  {
                    "source": "methadone",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.2220000000000002,
                      "normal": 130.43800000000002
                    }
                  },
                  {
                    "source": "青岛银行",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.072,
                      "normal": 584.736
                    }
                  },
                  {
                    "source": "青岛银行",
                    "target": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 9.88
                    }
                  },
                  {
                    "source": "青岛银行",
                    "target": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 11.422
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 60.664
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.10200000000000001,
                      "normal": 143.788
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.052000000000000005,
                      "normal": 35.242000000000004
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 2.152,
                      "normal": 143.71
                    }
                  },
                  {
                    "source": "NH",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 205.9,
                      "danger": 0.052000000000000005
                    }
                  },
                  {
                    "source": "CRM",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 952.8299999999999
                    }
                  },
                  {
                    "source": "CRM",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 2.9440000000000004,
                      "normal": 473.774
                    }
                  },
                  {
                    "source": "infectivities",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 19.762
                    }
                  },
                  {
                    "source": "KAD",
                    "target": "智模",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 4.296,
                      "normal": 3108.2200000000003
                    }
                  },
                  {
                    "source": "KAD",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.034,
                      "normal": 13.826
                    }
                  },
                  {
                    "source": "gainfully",
                    "target": "mispricing",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.35200000000000004,
                      "normal": 813.974
                    }
                  },
                  {
                    "source": "gainfully",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.04000000000000001,
                      "normal": 51.568
                    }
                  },
                  {
                    "source": "relocator",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 432.53000000000003
                    }
                  },
                  {
                    "source": "relocator",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.782,
                      "normal": 107.24400000000001
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.27799999999999997,
                      "normal": 1125.488
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.17800000000000002,
                      "normal": 1024.164
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.032,
                      "normal": 242.24400000000003
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 25.538
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.6120000000000001,
                      "normal": 107.134
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.05600000000000001,
                      "normal": 204.30200000000002
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.026000000000000002,
                      "normal": 87.44200000000001
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 10.922
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.17400000000000002,
                      "normal": 204.236
                    }
                  },
                  {
                    "source": "gradine",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 8.93
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 732.346,
                      "danger": 0.126
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "compellation",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 180.482
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.268,
                      "normal": 1447.2420000000002
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.042,
                      "normal": 82.05000000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 110.86400000000002
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "remarkableness",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.254,
                      "normal": 104.708
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "LIMS",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.37200000000000005,
                      "normal": 1767.798
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 533.23,
                      "danger": 0.05
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "blastodiscs",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 281.146
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "prickliest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.828,
                      "normal": 279.064
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 37.564
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.028000000000000004,
                      "normal": 20.408
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.118,
                      "normal": 242.05
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "arabesk",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 3.1300000000000003,
                      "normal": 821.4280000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "methadone",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.072,
                      "normal": 128.96400000000003
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "平安银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 1814.65,
                      "danger": 2.5220000000000002
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "multiracialisms",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.7000000000000001,
                      "normal": 174.942
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.3820000000000001,
                      "normal": 6140.146000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "KAD",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.41600000000000004,
                      "normal": 1858.862
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.198,
                      "normal": 97.298
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "青岛银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.69,
                      "normal": 1827.1240000000003
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 58.584,
                      "normal": 10003.208
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 67.046,
                      "normal": 4505.166
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "legwork",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.6420000000000003,
                      "normal": 647.144
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 9.032,
                      "normal": 502.846
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.382,
                      "normal": 187.06400000000002
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "unapproachabilities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 2.7420000000000004,
                      "normal": 1089.852
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.544,
                      "normal": 1640.478
                    }
                  },
                  {
                    "source": "uraei",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 6.04
                    }
                  },
                  {
                    "source": "LIMS",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.34,
                      "normal": 1742.8400000000001
                    }
                  },
                  {
                    "source": "microparasites",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 4.266,
                      "normal": 617.72
                    }
                  },
                  {
                    "source": "SRM",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 716.644
                    }
                  },
                  {
                    "source": "SRM",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 7.944,
                      "normal": 1307.4440000000002
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 20.524
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.04000000000000001,
                      "normal": 65.924
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.46799999999999997,
                      "normal": 65.568
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 278.42600000000004
                    }
                  },
                  {
                    "source": "rummlegumptions",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.18600000000000003,
                      "normal": 258.168
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.478,
                      "normal": 7.978000000000001
                    },
                    "class": "danger"
                  },
                  {
                    "source": "semitropics",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.20800000000000002,
                      "normal": 485.086
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 8.76
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.564,
                      "normal": 223.76999999999998
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "previsionary",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.034,
                      "normal": 22.124000000000002
                    }
                  },
                  {
                    "source": "schemozzling",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 26.160000000000004
                    }
                  },
                  {
                    "source": "schemozzling",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.286,
                      "normal": 6.328
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 414.49399999999997,
                      "danger": 0.08000000000000002
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 23.726,
                      "danger": 0.002
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.45199999999999996,
                      "normal": 971.8940000000001
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 68.152,
                      "danger": 0.17600000000000002
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 4.526,
                      "normal": 567.88
                    }
                  },
                  {
                    "source": "cleavage",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 50.62200000000001
                    }
                  },
                  {
                    "source": "cleavage",
                    "target": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 51.966
                    }
                  },
                  {
                    "source": "cleavage",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 10.456000000000001
                    }
                  },
                  {
                    "source": "cleavage",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 7.609999999999999
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 9.846
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 139.922
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 153.304
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 30.445999999999998
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 21.97
                    }
                  }
                ],
                "maxVolume": 96035.538,
                "props": {
                  "maxSemaphores": [
                    {
                      "targetRegion": "eu-west-1",
                      "region": "us-east-1",
                      "value": "20"
                    },
                    {
                      "targetRegion": "us-west-2",
                      "region": "eu-west-1",
                      "value": "20"
                    },
                    {
                      "targetRegion": "us-west-2",
                      "region": "us-east-1",
                      "value": "200"
                    },
                    {
                      "targetRegion": "us-east-1",
                      "region": "us-west-2",
                      "value": "160"
                    },
                    {
                      "targetRegion": "us-east-1",
                      "region": "eu-west-1",
                      "value": "20"
                    }
                  ]
                },
                "metadata": {},
                "class": "normal"
              },
              {
                "renderer": "region",
                "name": "eu-west-1",
                "displayName": "Server3",
                "updated": 1477690450280,
                "nodes": [
                  {
                    "name": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "oceanographic",
                        "metrics": {
                          "danger": 51.526,
                          "normal": 21282.100000000002
                        }
                      },
                      {
                        "name": "amboceptors",
                        "metrics": {
                          "danger": 0.27,
                          "normal": 123.798
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "proxy-prod",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "pitched",
                        "metrics": {
                          "danger": 44.784,
                          "normal": 18983.510000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "insightful",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 9106.082
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "EAS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "natations",
                        "metrics": {
                          "danger": 1.6620000000000001,
                          "normal": 4847.258000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "农行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "haematurias",
                        "metrics": {
                          "danger": 4030.91,
                          "normal": 29.980000000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "protandries",
                        "metrics": {
                          "danger": 1.1560000000000001,
                          "normal": 4089.86
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "traffickers",
                        "metrics": {
                          "normal": 3317.3080000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "ikebana",
                        "metrics": {
                          "normal": 5524.654
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "slicknesses",
                        "metrics": {
                          "danger": 0.016,
                          "normal": 2318.644
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "智模",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "sicklier",
                        "metrics": {
                          "danger": 0.002,
                          "normal": 1810.688
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "virtuosic",
                        "metrics": {
                          "normal": 2149.422
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "青岛银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "tendu",
                        "metrics": {
                          "normal": 1270.272
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "KAD",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "underkeeper",
                        "metrics": {
                          "normal": 1151.8700000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "平安银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "ephors",
                        "metrics": {
                          "normal": 1050.978
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "undiscernible",
                        "metrics": {
                          "normal": 2014.3700000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "LIMS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "detent",
                        "metrics": {
                          "normal": 913.5500000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "italianated",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "davening",
                        "metrics": {
                          "normal": 812.89
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "shamas",
                        "metrics": {
                          "danger": 0.254,
                          "normal": 2046.296
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "myelocytic",
                        "metrics": {
                          "normal": 1807.08
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "EPPOS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "misadapts",
                        "metrics": {
                          "danger": 710.6460000000001,
                          "normal": 53.666
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "globalised",
                        "metrics": {
                          "normal": 51.006
                        }
                      },
                      {
                        "name": "determinants",
                        "metrics": {
                          "normal": 51.39600000000001
                        }
                      },
                      {
                        "name": "refed",
                        "metrics": {
                          "normal": 616.6080000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "unhesitating",
                        "metrics": {
                          "danger": 43.526,
                          "normal": 1011.1
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "unapproachabilities",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "burramundi",
                        "metrics": {
                          "normal": 510.774
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "pucks",
                        "metrics": {
                          "normal": 489.39799999999997
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "arabesk",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "viticultures",
                        "metrics": {
                          "danger": 0.020000000000000004,
                          "normal": 324.78000000000003
                        }
                      },
                      {
                        "name": "chado",
                        "metrics": {
                          "normal": 20.748
                        }
                      },
                      {
                        "name": "plowers",
                        "metrics": {
                          "normal": 20.742
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "infallibly",
                        "metrics": {
                          "normal": 428.74,
                          "danger": 0.054000000000000006
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "mispricing",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "ralphs",
                        "metrics": {
                          "danger": 0.010000000000000002,
                          "normal": 372.718
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "martians",
                        "metrics": {
                          "normal": 340.39000000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "fluorescences",
                        "metrics": {
                          "normal": 364.58200000000005,
                          "danger": 0.17400000000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "spitefulnesses",
                        "metrics": {
                          "normal": 381.944
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "coenobites",
                        "metrics": {
                          "normal": 4.170000000000001
                        }
                      },
                      {
                        "name": "mercurialises",
                        "metrics": {
                          "danger": 0.17,
                          "normal": 433.778
                        }
                      },
                      {
                        "name": "darnations",
                        "metrics": {
                          "normal": 4.188000000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "legwork",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "obtainment",
                        "metrics": {
                          "normal": 270.09000000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "election",
                        "metrics": {
                          "danger": 56.836000000000006,
                          "normal": 194.942
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "dreadlocks",
                        "metrics": {
                          "normal": 207.42
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "flashpacker",
                        "metrics": {
                          "danger": 0.03,
                          "normal": 468.98800000000006
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "profulgent",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "emblazonments",
                        "metrics": {
                          "normal": 465.58000000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "imbalmers",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "prawning",
                        "metrics": {
                          "normal": 134.08
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "prickliest",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "repulsing",
                        "metrics": {
                          "normal": 116.976
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "microparasites",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "dissymmetrical",
                        "metrics": {
                          "danger": 0.47400000000000003,
                          "normal": 490.53000000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "blastodiscs",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "choosers",
                        "metrics": {
                          "normal": 102.95
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "micropipette",
                        "metrics": {
                          "normal": 105.41400000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "compellation",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "rabidness",
                        "metrics": {
                          "normal": 11.426000000000002,
                          "danger": 87.786
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "methadone",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "polyparia",
                        "metrics": {
                          "danger": 0.03,
                          "normal": 89.00800000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "connectivity",
                        "metrics": {
                          "normal": 306.758
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "navicular",
                        "metrics": {
                          "normal": 78.39
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "multiracialisms",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "traplike",
                        "metrics": {
                          "danger": 1.2800000000000002,
                          "normal": 101.37400000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "pilferer",
                        "metrics": {
                          "danger": 0.43600000000000005,
                          "normal": 731.02
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "alignment",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "spaniolizes",
                        "metrics": {
                          "normal": 71.76
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "lycee",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "tridymites",
                        "metrics": {
                          "normal": 55.562000000000005
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "cylindricalness",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "inmeshed",
                        "metrics": {
                          "danger": 9.76,
                          "normal": 52.934000000000005
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "poundages",
                        "metrics": {
                          "normal": 28.422000000000004,
                          "danger": 23.504
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "tutresses",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "turboshafts",
                        "metrics": {
                          "danger": 0.018,
                          "normal": 50.884
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "predispositions",
                        "metrics": {
                          "normal": 79.25800000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "reoxidize",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "heniquen",
                        "metrics": {
                          "normal": 36.728,
                          "danger": 2.196
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "salvability",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "trawlers",
                        "metrics": {
                          "danger": 0.06,
                          "normal": 38.900000000000006
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "playlisted",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "superablenesses",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "dotcommer",
                        "metrics": {}
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "maysterdomes",
                        "metrics": {
                          "danger": 0.24,
                          "normal": 30.168000000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "corfhouses",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "elations",
                        "metrics": {
                          "normal": 0.10400000000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "overdosed",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "slaters",
                        "metrics": {
                          "normal": 0.31600000000000006
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "rummlegumptions",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "zygapophysial",
                        "metrics": {
                          "danger": 0.024,
                          "normal": 68.312
                        }
                      },
                      {
                        "name": "extraforaneous",
                        "metrics": {
                          "normal": 4.402
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "neatherd",
                        "metrics": {
                          "normal": 61.192
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "nicompoops",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "astucities",
                        "metrics": {
                          "danger": 9.15,
                          "normal": 17.154
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "empyreal",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "inselberge",
                        "metrics": {
                          "normal": 18.396
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "precited",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "nephrotoxic",
                        "metrics": {}
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "previsionary",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "unannoyed",
                        "metrics": {
                          "danger": 0.31600000000000006,
                          "normal": 11.586
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "kaoliangs",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "darnel",
                        "metrics": {
                          "normal": 12.528
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "stressbuster",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "fisherwomen",
                        "metrics": {
                          "normal": 0.11399999999999999
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "atma",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "counterfeit",
                        "metrics": {
                          "normal": 170.68
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "name": "INTERNET",
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "cleavage",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "panellists"
                      },
                      {
                        "name": "elementalisms",
                        "metrics": {
                          "normal": 45.956
                        }
                      },
                      {
                        "name": "phosphoric",
                        "metrics": {
                          "normal": 45.982
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "appropriable",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "jasmonates",
                        "metrics": {
                          "normal": 345.24
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  }
                ],
                "connections": [
                  {
                    "source": "INTERNET",
                    "target": "proxy-prod",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 66.142,
                      "normal": 16086.784
                    }
                  },
                  {
                    "source": "INTERNET",
                    "target": "EAS",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 8.326,
                      "normal": 4744.914
                    }
                  },
                  {
                    "source": "INTERNET",
                    "target": "proxy-log",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.5660000000000001,
                      "normal": 3838.1540000000005
                    }
                  },
                  {
                    "source": "INTERNET",
                    "target": "tutresses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "warning": 0.006,
                      "danger": 0.006,
                      "normal": 48.244
                    }
                  },
                  {
                    "source": "YSL",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 49.452
                    }
                  },
                  {
                    "source": "accounts",
                    "target": "salvability",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.034,
                      "normal": 30.352
                    }
                  },
                  {
                    "source": "accounts",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 30.852
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "nicompoops",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 17.464
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "playlisted",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 36.838
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "precited",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 15.274000000000001
                    }
                  },
                  {
                    "source": "unapproachabilities",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 52.44
                    }
                  },
                  {
                    "source": "unapproachabilities",
                    "target": "cylindricalness",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 53.59400000000001
                    }
                  },
                  {
                    "source": "农行",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 8.8
                    }
                  },
                  {
                    "source": "农行",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 2.5620000000000003,
                      "normal": 3307.696
                    }
                  },
                  {
                    "source": "农行",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 3.598,
                      "normal": 728.466
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 52.105999999999995
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 35.568000000000005,
                      "danger": 0.020000000000000004
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 66.95
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.17600000000000002,
                      "normal": 234.21
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "rummlegumptions",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 18.152
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "overdosed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 18.152
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "corfhouses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 18.152
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.03,
                      "normal": 36.598000000000006
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 433.78999999999996
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.462,
                      "normal": 38.986000000000004
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.192,
                      "normal": 224.294
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 25.248,
                      "danger": 0.066
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.08000000000000002,
                      "normal": 108.98800000000001
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "rummlegumptions",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 6.332000000000001
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "overdosed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 6.332000000000001
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "corfhouses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 6.332000000000001
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "italianated",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.32400000000000007,
                      "normal": 865.306
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 13.26,
                      "normal": 1007.164
                    }
                  },
                  {
                    "source": "relocator",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.248,
                      "normal": 356.504
                    }
                  },
                  {
                    "source": "relocator",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 54.518
                    }
                  },
                  {
                    "source": "cylindricalness",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 15.032
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.016,
                      "normal": 94.428
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 7.516
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.7280000000000002,
                      "normal": 269.614
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.11599999999999999,
                      "normal": 466.20000000000005
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.10600000000000001,
                      "normal": 501.17600000000004
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 78.14
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 10.608
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.036,
                      "normal": 53.462
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 79.578
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 35.508
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 79.57600000000001
                    }
                  },
                  {
                    "source": "atma",
                    "target": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 180.454
                    }
                  },
                  {
                    "source": "atma",
                    "target": "profulgent",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 171.734
                    }
                  },
                  {
                    "source": "atma",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.32400000000000007,
                      "normal": 171.44000000000003
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 296.514,
                      "danger": 0.068
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 28.724000000000004
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "kaoliangs",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 11.556000000000001
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "lycee",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 55.632000000000005
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.022000000000000002,
                      "normal": 8.468000000000002
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 31.416000000000004
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 12.498000000000001
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 11.870000000000001
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 14.068000000000001
                    }
                  },
                  {
                    "source": "tutresses",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.08800000000000001,
                      "normal": 47.882000000000005
                    }
                  },
                  {
                    "source": "cleavage",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.022000000000000002,
                      "normal": 18.924000000000003
                    }
                  },
                  {
                    "source": "cleavage",
                    "target": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 16.662000000000003
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.046000000000000006,
                      "normal": 346.98600000000005
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "compellation",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 95.14600000000002
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.202,
                      "normal": 966.808
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 34.796
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 74.53200000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.422,
                      "normal": 48.504000000000005
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "LIMS",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.128,
                      "normal": 903.142
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 294.858,
                      "danger": 0.142
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "empyreal",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 16.416
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "blastodiscs",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 100.72000000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "prickliest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 105.006
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 18.150000000000002
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 10.318000000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.042,
                      "normal": 119.562
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 15.034
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "arabesk",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 427.89
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "methadone",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 86.78800000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "平安银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.092,
                      "normal": 1076.2920000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "multiracialisms",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.564,
                      "normal": 68.38600000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.866,
                      "normal": 3333.9580000000005
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "KAD",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 1147.178
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.10400000000000001,
                      "normal": 53.804
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "青岛银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 9.162,
                      "normal": 1238.498
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 4.720000000000001,
                      "normal": 5490.286
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 11.666,
                      "normal": 2459.642
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "legwork",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.22999999999999998,
                      "normal": 304.594
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.038000000000000006,
                      "normal": 393.14200000000005
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.032,
                      "normal": 120.03399999999999
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "unapproachabilities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.057999999999999996,
                      "normal": 499.932
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.338,
                      "normal": 644.3820000000001
                    }
                  },
                  {
                    "source": "ZH",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 38.458
                    }
                  },
                  {
                    "source": "uraei",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.044000000000000004,
                      "normal": 152.102
                    }
                  },
                  {
                    "source": "LIMS",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.15600000000000003,
                      "normal": 904.082
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.038000000000000006,
                      "normal": 47.308
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 21.118000000000002
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 25.586000000000002
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 8.518
                    }
                  },
                  {
                    "source": "microparasites",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.108,
                      "normal": 368.564
                    }
                  },
                  {
                    "source": "salvability",
                    "target": "reoxidize",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.026000000000000002,
                      "normal": 38.728
                    }
                  },
                  {
                    "source": "SRM",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 295.798
                    }
                  },
                  {
                    "source": "SRM",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.08600000000000001,
                      "normal": 578.22
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 13.282
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 31.977999999999998
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.21800000000000003,
                      "normal": 31.718000000000004
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.194,
                      "normal": 128.91
                    }
                  },
                  {
                    "source": "methadone",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.6120000000000001,
                      "normal": 88.91000000000001
                    }
                  },
                  {
                    "source": "青岛银行",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.094,
                      "normal": 549.4720000000001
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 19.596000000000004
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.046000000000000006,
                      "normal": 68.16000000000001
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.024,
                      "normal": 21.134
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.328,
                      "normal": 68.16799999999999
                    }
                  },
                  {
                    "source": "NH",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 105.46800000000002,
                      "danger": 0.026000000000000002
                    }
                  },
                  {
                    "source": "rummlegumptions",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 165.952
                    }
                  },
                  {
                    "source": "CRM",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.12,
                      "normal": 396.09200000000004
                    }
                  },
                  {
                    "source": "CRM",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.026000000000000002,
                      "normal": 227.73400000000004
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 222.92399999999998
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.4660000000000002,
                      "normal": 153.282
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "previsionary",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 11.554000000000002
                    }
                  },
                  {
                    "source": "infectivities",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 9.794
                    }
                  },
                  {
                    "source": "schemozzling",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 7.526000000000001
                    }
                  },
                  {
                    "source": "gainfully",
                    "target": "mispricing",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.15200000000000002,
                      "normal": 370.10200000000003
                    }
                  },
                  {
                    "source": "gainfully",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 16.908
                    }
                  },
                  {
                    "source": "KAD",
                    "target": "智模",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.8119999999999999,
                      "normal": 1858.18
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.054000000000000006,
                      "normal": 214.48600000000002
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 10.4
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.294,
                      "normal": 429.02
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.328,
                      "normal": 58.42000000000001
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.4800000000000002,
                      "normal": 215.53400000000002
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 6.412000000000001
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 83.342
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 31.422000000000004
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "superablenesses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 31.422000000000004
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 9.698
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "stressbuster",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 9.698
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 6.6000000000000005
                    }
                  }
                ],
                "maxVolume": 73535.998,
                "props": {
                  "maxSemaphores": [
                    {
                      "targetRegion": "eu-west-1",
                      "region": "us-east-1",
                      "value": "20"
                    },
                    {
                      "targetRegion": "us-east-1",
                      "region": "us-west-2",
                      "value": "160"
                    },
                    {
                      "targetRegion": "us-east-1",
                      "region": "eu-west-1",
                      "value": "20"
                    },
                    {
                      "targetRegion": "us-west-2",
                      "region": "eu-west-1",
                      "value": "20"
                    },
                    {
                      "targetRegion": "us-west-2",
                      "region": "us-east-1",
                      "value": "200"
                    }
                  ]
                },
                "metadata": {},
                "class": "normal"
              },
              {
                "renderer": "region",
                "name": "us-west-2",
                "displayName": "Server1",
                "updated": 1477690452072,
                "nodes": [
                  {
                    "name": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "heterostylism",
                        "metrics": {
                          "danger": 59.724000000000004,
                          "normal": 26213.520000000004
                        }
                      },
                      {
                        "name": "bulimies"
                      },
                      {
                        "name": "neurosecretory",
                        "metrics": {
                          "danger": 0.244,
                          "normal": 121.258
                        }
                      },
                      {
                        "name": "sensualisation",
                        "metrics": {
                          "danger": 0.26,
                          "normal": 121.14000000000001
                        }
                      },
                      {
                        "name": "soppiest",
                        "metrics": {
                          "danger": 0.31000000000000005,
                          "normal": 120.69800000000001
                        }
                      },
                      {
                        "name": "postop",
                        "metrics": {
                          "danger": 0.264,
                          "normal": 121.20400000000001
                        }
                      },
                      {
                        "name": "magisteries",
                        "metrics": {
                          "danger": 0.2,
                          "normal": 107.31800000000001
                        }
                      },
                      {
                        "name": "miraculous",
                        "metrics": {
                          "danger": 0.30000000000000004,
                          "normal": 120.54000000000002
                        }
                      },
                      {
                        "name": "sneeing"
                      },
                      {
                        "name": "iridisations",
                        "metrics": {
                          "danger": 0.064,
                          "normal": 39.858000000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "proxy-prod",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "conveyorized",
                        "metrics": {
                          "danger": 15.376,
                          "normal": 22666.646
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "stromatic",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 11166.348
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "EAS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "chicnesses",
                        "metrics": {
                          "danger": 2.7840000000000003,
                          "normal": 6895.146000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "农行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "uncurbing",
                        "metrics": {
                          "danger": 5158.32,
                          "normal": 61.754
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "whoobubs",
                        "metrics": {
                          "normal": 4052.878
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "quahogs",
                        "metrics": {
                          "danger": 0.034,
                          "normal": 4510.330000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "tawdry",
                        "metrics": {
                          "normal": 2786.2900000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "starfucking",
                        "metrics": {
                          "normal": 2196.164
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "智模",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "transfigurations",
                        "metrics": {
                          "danger": 0.05600000000000001,
                          "normal": 1924.698
                        }
                      },
                      {
                        "name": "pignoli",
                        "metrics": {
                          "normal": 17.058000000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "substraction",
                        "metrics": {
                          "normal": 2260.9860000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "hooliganisms",
                        "metrics": {
                          "normal": 2663.9660000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "EPPOS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "crosslinguistically",
                        "metrics": {
                          "danger": 1240.9440000000002,
                          "normal": 97.93200000000002
                        }
                      },
                      {
                        "name": "polarizing",
                        "metrics": {
                          "normal": 0.134
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "平安银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "cansticks",
                        "metrics": {
                          "normal": 1316.9740000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "cartelised",
                        "metrics": {
                          "normal": 2530.6360000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "numerological",
                        "metrics": {
                          "danger": 0.10600000000000001,
                          "normal": 2744.8080000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "KAD",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "preachers",
                        "metrics": {
                          "normal": 1134.912
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "toxocara",
                        "metrics": {
                          "normal": 836.822
                        }
                      },
                      {
                        "name": "apotheosising",
                        "metrics": {
                          "normal": 61.148
                        }
                      },
                      {
                        "name": "gyrocars",
                        "metrics": {
                          "normal": 60.970000000000006
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "青岛银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "blueliners",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 957.1020000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "italianated",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "disseminated",
                        "metrics": {
                          "normal": 941.89
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "LIMS",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "macerative",
                        "metrics": {
                          "normal": 835.7620000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "reactuated",
                        "metrics": {
                          "danger": 4.586,
                          "normal": 1277.366
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "unapproachabilities",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "sambhurs",
                        "metrics": {
                          "normal": 657.5340000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "microinstruction",
                        "metrics": {
                          "normal": 623.392
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "demast",
                        "metrics": {
                          "normal": 660.5140000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "vowelizing",
                        "metrics": {
                          "normal": 502.378,
                          "danger": 0.066
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "chylomicrons",
                        "metrics": {
                          "normal": 630.312
                        }
                      },
                      {
                        "name": "dionysiac",
                        "metrics": {
                          "normal": 6.456
                        }
                      },
                      {
                        "name": "escheatage",
                        "metrics": {
                          "normal": 6.4
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "mispricing",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "dockside",
                        "metrics": {
                          "danger": 0.012,
                          "normal": 441.498
                        }
                      },
                      {
                        "name": "athetesis",
                        "metrics": {
                          "normal": 12.48
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "legwork",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "arabesk",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "graveling",
                        "metrics": {
                          "normal": 514.494
                        }
                      },
                      {
                        "name": "casebooks",
                        "metrics": {
                          "normal": 23.912000000000003
                        }
                      },
                      {
                        "name": "parallelism",
                        "metrics": {
                          "normal": 23.866
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "arrishes",
                        "metrics": {
                          "normal": 348.108
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "organophosphoruses",
                        "metrics": {
                          "normal": 340.05
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "designation",
                        "metrics": {
                          "normal": 333.002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "tucked",
                        "metrics": {
                          "danger": 0.024,
                          "normal": 712.1320000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "calefactors",
                        "metrics": {
                          "danger": 38.046,
                          "normal": 340.51800000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "prickliest",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "overdoers",
                        "metrics": {
                          "normal": 277.372
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "profulgent",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "roars",
                        "metrics": {
                          "normal": 798.738
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "redsear",
                        "metrics": {
                          "normal": 281.23400000000004,
                          "danger": 0.004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "mismeet",
                        "metrics": {
                          "normal": 234.268
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "imbalmers",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "zaires",
                        "metrics": {
                          "normal": 187.678
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "tutresses",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "irrationalness",
                        "metrics": {
                          "danger": 0.084,
                          "normal": 174.484
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "multiracialisms",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "lanital",
                        "metrics": {
                          "danger": 0.37000000000000005,
                          "normal": 225.03600000000003
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "compellation",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "publically",
                        "metrics": {
                          "normal": 34.78,
                          "danger": 113.404
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "blastodiscs",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "cooldown",
                        "metrics": {
                          "normal": 137.452
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "alignment",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "homalographic",
                        "metrics": {
                          "normal": 129.872
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "cylindricalness",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "fussing",
                        "metrics": {
                          "danger": 7.006,
                          "normal": 121.08800000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "angelica",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 115.654
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "microparasites",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "autoionizations",
                        "metrics": {
                          "danger": 0.7240000000000001,
                          "normal": 442.1600000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "bani",
                        "metrics": {
                          "normal": 108.54200000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "staircases",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "askances",
                        "metrics": {
                          "normal": 82.15800000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "bankit",
                        "metrics": {
                          "normal": 128.31
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "doublespeaks",
                        "metrics": {
                          "normal": 68.102,
                          "danger": 18.11
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "karroos",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "zanies",
                        "metrics": {
                          "danger": 0.8160000000000001,
                          "normal": 77.23200000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "remarkableness",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "coft",
                        "metrics": {
                          "danger": 0.094,
                          "normal": 72.884
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "methadone",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "filagrees",
                        "metrics": {
                          "danger": 0.016,
                          "normal": 58.355999999999995
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "superablenesses",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "vigilantness",
                        "metrics": {
                          "normal": 0.17800000000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "reoxidize",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "alterably",
                        "metrics": {
                          "normal": 48.21600000000001,
                          "danger": 2.0260000000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "salvability",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "galivanted",
                        "metrics": {
                          "danger": 0.054000000000000006,
                          "normal": 49.332
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "playlisted",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "lycee",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "unauthoritative",
                        "metrics": {
                          "normal": 48.772000000000006
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "aristocrats",
                        "metrics": {
                          "normal": 36.72
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "intergraded",
                        "metrics": {
                          "danger": 0.27,
                          "normal": 31.28
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "overdosed",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "spiraling",
                        "metrics": {
                          "normal": 0.398
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "corfhouses",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "plantar",
                        "metrics": {
                          "normal": 0.128
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "rummlegumptions",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "perfecting",
                        "metrics": {
                          "danger": 0.004,
                          "normal": 8.906
                        }
                      },
                      {
                        "name": "satirizes",
                        "metrics": {
                          "danger": 0.016,
                          "normal": 86.33200000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "nicompoops",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "rough",
                        "metrics": {
                          "danger": 9.39,
                          "normal": 20.514
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "precited",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "emulsible",
                        "metrics": {}
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "killocks",
                        "metrics": {
                          "normal": 723.1640000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "previsionary",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "celluloid",
                        "metrics": {
                          "danger": 0.38,
                          "normal": 12.568000000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "kaoliangs",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "groining",
                        "metrics": {
                          "normal": 11.674
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "empyreal",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "diazoles",
                        "metrics": {
                          "normal": 15.904
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "stressbuster",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "foretokening",
                        "metrics": {
                          "normal": 0.24
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "hydroxyureas",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "attolaser",
                        "metrics": {
                          "normal": 7.07
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "atma",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "wadmoll",
                        "metrics": {
                          "normal": 275.08000000000004
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "cleavage",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "apostrophuses"
                      },
                      {
                        "name": "undeserts",
                        "metrics": {
                          "normal": 52.18600000000001
                        }
                      },
                      {
                        "name": "powerboat",
                        "metrics": {
                          "danger": 0.006,
                          "normal": 51.92000000000001
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  },
                  {
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [],
                    "name": "INTERNET",
                    "renderer": "focusedChild"
                  },
                  {
                    "name": "appropriable",
                    "metadata": {
                      "streaming": 1
                    },
                    "clusters": [
                      {
                        "name": "lycanthropy",
                        "metrics": {
                          "normal": 309.84400000000005,
                          "danger": 0.014000000000000002
                        }
                      }
                    ],
                    "renderer": "focusedChild"
                  }
                ],
                "connections": [
                  {
                    "source": "INTERNET",
                    "target": "proxy-prod",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "warning": 0.9199999999999999,
                      "danger": 55.14600000000001,
                      "normal": 21140.684
                    },
                    "notices": [
                      {
                        "title": "CPU usage average at 80%",
                        "link": "http://link/to/relevant/thing",
                        "severity": 1
                      },
                      {
                        "title": "Reticulating splines"
                      }
                    ]
                  },
                  {
                    "source": "INTERNET",
                    "target": "EAS",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 13.784,
                      "normal": 6613.036
                    }
                  },
                  {
                    "source": "INTERNET",
                    "target": "proxy-log",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.7280000000000001,
                      "normal": 5332.1140000000005
                    },
                    "notices": [
                      {
                        "title": "Bob Loblaws law blog logging log blobs",
                        "link": "http://link/to/relevant/thing"
                      }
                    ]
                  },
                  {
                    "source": "INTERNET",
                    "target": "tutresses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.068,
                      "normal": 171.41400000000002
                    }
                  },
                  {
                    "source": "YSL",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.018,
                      "normal": 39.846000000000004
                    }
                  },
                  {
                    "source": "accounts",
                    "target": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 32.126,
                      "danger": 0.010000000000000002
                    }
                  },
                  {
                    "source": "accounts",
                    "target": "salvability",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.028000000000000004,
                      "normal": 32.202
                    }
                  },
                  {
                    "source": "accounts",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 101.02000000000001
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "nicompoops",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 20.258000000000003
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "playlisted",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 44.644000000000005
                    }
                  },
                  {
                    "source": "reoxidize",
                    "target": "precited",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 17.822
                    }
                  },
                  {
                    "source": "unapproachabilities",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 95.41000000000001
                    }
                  },
                  {
                    "source": "unapproachabilities",
                    "target": "cylindricalness",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 119.498
                    }
                  },
                  {
                    "source": "unapproachabilities",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 6.644
                    }
                  },
                  {
                    "source": "农行",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 13.36
                    }
                  },
                  {
                    "source": "农行",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 6.364000000000001
                    }
                  },
                  {
                    "source": "农行",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 22.744,
                      "normal": 4113.168000000001
                    }
                  },
                  {
                    "source": "农行",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 13.238,
                      "normal": 1003.356
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 9.342
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 87.626
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 75.652,
                      "danger": 0.006
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.036,
                      "normal": 97.138
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 346.36
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "rummlegumptions",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 24.578000000000003
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "overdosed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 24.578000000000003
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "corfhouses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 24.578000000000003
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.062,
                      "normal": 58.92400000000001
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "multiracialisms",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.04000000000000001,
                      "normal": 9.144
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.018,
                      "normal": 542.3760000000001
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.246,
                      "normal": 73.64
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.7480000000000002,
                      "normal": 334.97800000000007
                    }
                  },
                  {
                    "source": "EPPOS",
                    "target": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.08800000000000001,
                      "normal": 32.244
                    }
                  },
                  {
                    "source": "karroos",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 18.080000000000002
                    }
                  },
                  {
                    "source": "karroos",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 18.61
                    }
                  },
                  {
                    "source": "karroos",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 19.798000000000002
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 177.306
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "italianated",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.08600000000000001,
                      "normal": 940.0680000000001
                    }
                  },
                  {
                    "source": "平安银行",
                    "target": "ZH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 2.406,
                      "normal": 1167.598
                    }
                  },
                  {
                    "source": "relocator",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 195.93800000000002
                    }
                  },
                  {
                    "source": "relocator",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 53.114000000000004
                    }
                  },
                  {
                    "source": "cylindricalness",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 52.742
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.034,
                      "normal": 92.37200000000001
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 8.22
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 10.394
                    }
                  },
                  {
                    "source": "arabesk",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.7160000000000002,
                      "normal": 284.696
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.238,
                      "normal": 796.37
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.13799999999999998,
                      "normal": 700.244
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 3.204,
                      "normal": 301.242
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 18.232
                    }
                  },
                  {
                    "source": "profulgent",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.128,
                      "normal": 74.742
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.057999999999999996,
                      "normal": 128.014
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 52.93200000000001
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.11399999999999999,
                      "normal": 9.628
                    }
                  },
                  {
                    "source": "gerents",
                    "target": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.012,
                      "normal": 128.032
                    }
                  },
                  {
                    "source": "atma",
                    "target": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 280.106
                    }
                  },
                  {
                    "source": "atma",
                    "target": "profulgent",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.014000000000000002,
                      "normal": 270.362
                    }
                  },
                  {
                    "source": "atma",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.754,
                      "normal": 269.712
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 245.572
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 22.886000000000003
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "kaoliangs",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 9.666
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "lycee",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 44.31
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 6.95,
                      "danger": 0.004
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 25.866000000000003
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 10.022
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 7.918000000000001
                    }
                  },
                  {
                    "source": "commerce",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 12.932
                    }
                  },
                  {
                    "source": "tutresses",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.192,
                      "normal": 168.186
                    }
                  },
                  {
                    "source": "staircases",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.1,
                      "normal": 79.14800000000001
                    }
                  },
                  {
                    "source": "cleavage",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 31.208
                    }
                  },
                  {
                    "source": "cleavage",
                    "target": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 32.018
                    }
                  },
                  {
                    "source": "hydroxyureas",
                    "target": "schemozzling",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 6.6819999999999995
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.134,
                      "normal": 514.4540000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "compellation",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 140.268
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.252,
                      "normal": 782.778
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 60.098000000000006
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 62.11000000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "remarkableness",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.08600000000000001,
                      "normal": 66.108
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "LIMS",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 6.16,
                      "normal": 830.7840000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "semitropics",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 399.80600000000004,
                      "danger": 0.038000000000000006
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "empyreal",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 9.036
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "blastodiscs",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 133.056
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "prickliest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.166,
                      "normal": 266.03000000000003
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 25.310000000000002
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "priviest",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 9.816
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.10600000000000001,
                      "normal": 134.934
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 13.328000000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "arabesk",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 410.144
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "methadone",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 57.954
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "平安银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.5700000000000001,
                      "normal": 1303.3360000000002
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "multiracialisms",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.492,
                      "normal": 132.894
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.414,
                      "normal": 3535.66
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "KAD",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.07800000000000001,
                      "normal": 1105.906
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "gainfully",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.052000000000000005,
                      "normal": 61.874
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "青岛银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.27599999999999997,
                      "normal": 945.338
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "SRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 36.184,
                      "normal": 6641.012
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 37.192,
                      "normal": 2877.512
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "legwork",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.786,
                      "normal": 419.77
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "relocator",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 234.27600000000004
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "brazed",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 96.80000000000001
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "unapproachabilities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.020000000000000004,
                      "normal": 641.096
                    }
                  },
                  {
                    "source": "ECC",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.12,
                      "normal": 1090.724
                    }
                  },
                  {
                    "source": "ZH",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.022000000000000002,
                      "normal": 74.956
                    }
                  },
                  {
                    "source": "LIMS",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.054000000000000006,
                      "normal": 818.2760000000001
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "shidduchim",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 49.242000000000004
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "accounts",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 19.75
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "salvability",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 7.126000000000001
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "commerce",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 38.438
                    }
                  },
                  {
                    "source": "priviest",
                    "target": "hounding",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 9.358
                    }
                  },
                  {
                    "source": "microparasites",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.4160000000000001,
                      "normal": 317.36400000000003
                    }
                  },
                  {
                    "source": "salvability",
                    "target": "reoxidize",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.048,
                      "normal": 47.370000000000005
                    }
                  },
                  {
                    "source": "SRM",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 432.442
                    }
                  },
                  {
                    "source": "SRM",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.18400000000000002,
                      "normal": 860.5840000000001
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.008,
                      "normal": 11.082
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.038000000000000006,
                      "normal": 38.434
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.22599999999999998,
                      "normal": 38.294000000000004
                    }
                  },
                  {
                    "source": "imbalmers",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 180.476
                    }
                  },
                  {
                    "source": "methadone",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.44400000000000006,
                      "normal": 58.24400000000001
                    }
                  },
                  {
                    "source": "青岛银行",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.064,
                      "normal": 280.04
                    }
                  },
                  {
                    "source": "青岛银行",
                    "target": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 6.566
                    }
                  },
                  {
                    "source": "青岛银行",
                    "target": "uraei",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.21200000000000002,
                      "normal": 10.708
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 51.422000000000004
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "ECC",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.032,
                      "normal": 121.39200000000001
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 6.744
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "immedicably",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.018,
                      "normal": 28.939999999999998
                    }
                  },
                  {
                    "source": "alignment",
                    "target": "CRM",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.594,
                      "normal": 121.43
                    }
                  },
                  {
                    "source": "NH",
                    "target": "立体库",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.038000000000000006,
                      "normal": 116.36800000000001
                    }
                  },
                  {
                    "source": "rummlegumptions",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.026000000000000002,
                      "normal": 200.15
                    }
                  },
                  {
                    "source": "CRM",
                    "target": "OA",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 581.86
                    }
                  },
                  {
                    "source": "CRM",
                    "target": "DMP",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.054000000000000006,
                      "normal": 245.97600000000003
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "tanrec",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 353.266
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "infectivities",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.52,
                      "normal": 161.19600000000003
                    }
                  },
                  {
                    "source": "semitropics",
                    "target": "previsionary",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.006,
                      "normal": 12.89
                    }
                  },
                  {
                    "source": "infectivities",
                    "target": "spuds",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 9.598
                    }
                  },
                  {
                    "source": "schemozzling",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.004,
                      "normal": 7.698
                    }
                  },
                  {
                    "source": "schemozzling",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.038000000000000006,
                      "normal": 6.098
                    }
                  },
                  {
                    "source": "KAD",
                    "target": "智模",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 2.5620000000000003,
                      "normal": 1925.06
                    }
                  },
                  {
                    "source": "KAD",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.016,
                      "normal": 12.534
                    }
                  },
                  {
                    "source": "gainfully",
                    "target": "mispricing",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.774,
                      "normal": 444.76000000000005
                    }
                  },
                  {
                    "source": "gainfully",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.010000000000000002,
                      "normal": 33.816
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "AMT",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.066,
                      "normal": 230.00400000000002
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "concatenates",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 12.844000000000001
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "NH",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.398,
                      "normal": 582.24
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.11200000000000002,
                      "normal": 38.684
                    }
                  },
                  {
                    "source": "majordomo",
                    "target": "YSL",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 1.722,
                      "normal": 305.412
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "oiks",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 6.2540000000000004
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "招商银行",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 99.68200000000002
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "gerents",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 48.038000000000004
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "superablenesses",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 48.038000000000004
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "stressbuster",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 7.8580000000000005
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "majordomo",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "normal": 7.8580000000000005
                    }
                  },
                  {
                    "source": "appropriable",
                    "target": "BW",
                    "metadata": {
                      "streaming": 1
                    },
                    "metrics": {
                      "danger": 0.002,
                      "normal": 14.768
                    }
                  }
                ],
                "maxVolume": 67936.982,
                "props": {
                  "maxSemaphores": [
                    {
                      "targetRegion": "eu-west-1",
                      "region": "us-east-1",
                      "value": "20"
                    },
                    {
                      "targetRegion": "us-east-1",
                      "region": "us-west-2",
                      "value": "160"
                    },
                    {
                      "targetRegion": "us-east-1",
                      "region": "eu-west-1",
                      "value": "20"
                    },
                    {
                      "targetRegion": "us-west-2",
                      "region": "eu-west-1",
                      "value": "20"
                    },
                    {
                      "targetRegion": "us-west-2",
                      "region": "us-east-1",
                      "value": "200"
                    }
                  ]
                },
                "metadata": {},
                "class": "normal"
              }
            ],
            "connections": [
              {
                "source": "INTERNET",
                "target": "us-west-2",
                "metrics": {
                  "normal": 38716.976,
                  "danger": 76.896,
                  "warning": 0.96
                },
                "notices": [],
                "class": "normal"
              },
              {
                "source": "INTERNET",
                "target": "us-east-1",
                "metrics": {
                  "danger": 130.71200000000002,
                  "normal": 63139.416,
                  "warning": 0.10200000000000001
                },
                "notices": [],
                "class": "normal"
              },
              {
                "source": "INTERNET",
                "target": "eu-west-1",
                "metrics": {
                  "normal": 31464.322000000004,
                  "danger": 97.60600000000001,
                  "warning": 0.006
                },
                "notices": [],
                "class": "normal"
              },
              {
                "source": "eu-west-1",
                "target": "us-east-1",
                "metrics": {}
              },
              {
                "source": "eu-west-1",
                "target": "us-west-2",
                "metrics": {}
              },
              {
                "source": "us-west-2",
                "target": "us-east-1",
                "metrics": {
                  "normal": 0.024
                }
              },
              {
                "source": "us-west-2",
                "target": "eu-west-1",
                "metrics": {
                  "danger": 0.004,
                  "normal": 0.19200000000000006
                }
              },
              {
                "source": "us-east-1",
                "target": "eu-west-1",
                "metrics": {
                  "normal": 0.16800000000000004
                }
              },
              {
                "source": "us-east-1",
                "target": "us-west-2",
                "metrics": {
                  "normal": 0.07
                }
              }
            ],
            "serverUpdateTime": 1477691777441
          };

          scope.viz.updateData(vizdata);
          scope.viz.setView();
          scope.viz.animate();







        }
      }
    };
  });

});