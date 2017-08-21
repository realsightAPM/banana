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

  module.controller('topologypie', function($scope, $http,$sce,$timeout,timer, querySrv, dashboard, filterSrv,$translate) {
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
      HbaseIP:'',
      isrefresh:true,
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

      if((($scope.panel.linkage_id === dashboard.current.linkage_id)&&$scope.panel.isrefresh)||dashboard.current.enable_linkage) {
        $scope.query_url = "http://" + $scope.panel.HbaseIP + "/applications.pinpoint";
        $.getJSON($scope.query_url, function (json) {
          $scope.data = json;
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

  module.directive('topologypieChart', function(querySrv,dashboard,filterSrv,$translate) {
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

            var data =[];
            for(var i1=0;i1<scope.data.length;i1++){
              data[i1]={name:scope.data[i1].applicationName,value:1}
            }
            myChart = echarts.init(document.getElementById(idd));

            var option2 = {
              title: {
                show:true,
                textStyle:{
                  color:labelcolor?"#fff":"#333"
                },
                text:$translate.instant('The application selected is：')+dashboard.current.network_app_name,
                x: "center"
              },
              color:colors,
              tooltip: {
                trigger: "item",
                confine:true,
                formatter: "{a} <br/>{b} "
              },
              legend: {
                show:true,
                x: "left",
                orient: scope.panel.arrangement,
                textStyle:{
                  fontSize:scope.panel.fontsize,
                  color:'auto'
                },
                data: data
              },
              label: {
                normal: {
                  formatter: "{b} ({d}%)",

                  textStyle:{
                    fontSize:scope.panel.fontsize
                  }
                }
              },
              labelLine: {
                normal: {
                  smooth: 0.6
                }
              },

              calculable: !0,
              series: [{
                name: scope.panel.title,
                type: "pie",
                roseType: scope.panel.RoseType,
                center: ['50%', '60%'],
                label: {
                  normal: {
                    show: false
                  },
                  emphasis: {
                    show: scope.panel.labels
                  }
                },
                lableLine: {
                  normal: {
                    show: !0
                  },
                  emphasis: {
                    show: !0
                  }
                },
                data: data,
                itemStyle: {
                  normal: {
                    color: function(params) {
                      var colorList = colors;
                      return colorList[params.dataIndex];
                    },
                    shadowColor: '#fff',
                    barBorderRadius: 5

                  }
                }
              }]
            };



            myChart.setOption(option2);
            myChart.on('click', function (params) {
              // 点击联动

                dashboard.current.network_app_name =  params.name;
                dashboard.current.linkage_id = scope.panel.linkage_id;
                dashboard.current.enable_linkage = false;
                dashboard.topology.network_force_refresh=true;
                dashboard.current.network_bar_show =true;
                dashboard.topology.hbasedata = null;
                dashboard.refresh();

              //scope.build_search(params);

            });



            // var bb = network.getSelection();
            // var cc= bb;
           // });
          }


       // });
        }
      }
    };
  });

});
