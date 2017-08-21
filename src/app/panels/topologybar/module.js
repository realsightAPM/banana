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

  module.controller('topologybar', function($scope, $http,$sce,$timeout, $translate,timer, querySrv, dashboard, filterSrv) {
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
      $scope.data = {};
      if(dashboard.current.network_bar_show){
      if((($scope.panel.linkage_id === dashboard.current.linkage_id)||dashboard.current.enable_linkage)) {

        if(dashboard.topology.hbasedata==null||_.isUndefined(dashboard.topology.hbasedata)){
          $scope.query_url = "http://" + $scope.panel.HbaseIP + "/getServerMapData.pinpoint?applicationName="+dashboard.current.network_app_name+"&from=" + dashboard.current.timefrom + "&to=" + dashboard.current.timeto + "&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT";
          $.getJSON($scope.query_url, function (json) {
            dashboard.topology.hbasedata = json;
            for(var i1 = 0;i1<dashboard.topology.hbasedata.applicationMapData.nodeDataArray.length;i1++){
              if(dashboard.topology.hbasedata.applicationMapData.nodeDataArray[i1].applicationName===dashboard.current.network_app_name ){
                $scope.data = dashboard.topology.hbasedata.applicationMapData.nodeDataArray[i1].histogram;
                break;
              }
            }
            $scope.$emit('render');

          });
        }else{
          $.getJSON('assets/json/json.json', function (json) {
          for(var i1 = 0;i1<dashboard.topology.hbasedata.applicationMapData.nodeDataArray.length;i1++){
            if(dashboard.topology.hbasedata.applicationMapData.nodeDataArray[i1].key===dashboard.current.network_node_id ){
              $scope.data = dashboard.topology.hbasedata.applicationMapData.nodeDataArray[i1].histogram;
              break;
            }
          }
          $scope.$emit('render');
          });
          // $scope.query_url = "http://" + $scope.panel.HbaseIP + "/getServerMapData.pinpoint?applicationName="+dashboard.current.network_app_name+"&from=" + dashboard.current.timefrom + "&to=" + dashboard.current.timeto + "&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT";
          // $.getJSON($scope.query_url, function (json) {
          //   dashboard.topology.hbasedata = json;
          //   for(var i1 = 0;i1<dashboard.topology.hbasedata.applicationMapData.nodeDataArray.length;i1++){
          //     if(dashboard.topology.hbasedata.applicationMapData.nodeDataArray[i1].key===dashboard.current.network_node_id ){
          //       $scope.data = dashboard.topology.hbasedata.applicationMapData.nodeDataArray[i1].histogram;
          //       break;
          //     }
          //   }
          //   $scope.$emit('render');
          // });
        }
      }
      }else{
        if((($scope.panel.linkage_id === dashboard.current.linkage_id)||dashboard.current.enable_linkage)) {
          $scope.query_url = "http://" + $scope.panel.HbaseIP + "/getServerMapData.pinpoint?applicationName="+dashboard.current.network_app_name+"&from=" + dashboard.current.timefrom + "&to=" + dashboard.current.timeto + "&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT";
          $.getJSON($scope.query_url, function (json) {
            dashboard.topology.hbasedata = json;
            for(var i1 = 0;i1<dashboard.topology.hbasedata.applicationMapData.nodeDataArray.length;i1++){
              if(dashboard.topology.hbasedata.applicationMapData.nodeDataArray[i1].applicationName===dashboard.current.network_app_name ){
                $scope.data = dashboard.topology.hbasedata.applicationMapData.nodeDataArray[i1].histogram;
                break;
              }
            }
           $scope.$emit('render');

          });
        }
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

  module.directive('topologybarChart', function(querySrv,dashboard,filterSrv) {
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
          //var echarts = require('echarts');
         require(['echarts'], function(ec){
           var echarts =ec;
          if(myChart) {
            myChart.dispose();
          }
           var j1 = 0;
           var x_data = [];
           var data_data=[];
           for(var item in scope.data){
             x_data[j1]=item;
             data_data[j1]=scope.data[item];
             j1++;
           }
          if(scope.panel.chart === 'network') {

            myChart = echarts.init(document.getElementById(idd));
            var option3 = {
              color:colors,
              tooltip : {
                trigger: 'axis',
                confine:true,
                axisPointer : {            // 坐标轴指示器，坐标轴触发有效
                  type : 'shadow'        // 默认为直线，可选为：'line' | 'shadow'
                }
              },
              grid: {
                left: '3%',
                right: '3%',
                bottom: '3%',
                top: '6%',
                containLabel: true
              },
              xAxis : [
                {
                  type : 'category',
                  data : x_data,
                  axisLine:{
                    show:false
                  },
                  axisLabel:{
                    show:true,
                    textStyle:{
                      color:labelcolor ? '#fff':'#4F4F4F',
                      fontSize:12,
                    }
                  },
                  axisTick: {
                    show:false,
                    alignWithLabel: false
                  }
                }
              ],
              yAxis : [
                {
                  type : 'value',
                  splitLine: {
                    show :false,
                    lineStyle:{
                      type:'dotted',
                      axisTick: {
                        show:false
                      },
                      color: labelcolor ? '#4F4F4F':'#F8F8FF'
                    }
                  },
                  axisLabel:{
                    show:true,
                    textStyle:{
                      color:labelcolor ? '#fff':'#4F4F4F',
                      fontSize:12+2,
                      fontStyle: 'italic'
                    }
                  },
                  nameTextStyle:{

                    color:labelcolor ? '#fff':'#4F4F4F',


                  },
                  axisLine:{
                    show:false
                  }
                }
              ],
              series : [
                {
                  name:scope.panel.title,
                  type:'bar',
                  barWidth: '43%',
                  data:data_data,
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
                }
              ]
            };
            myChart.setOption(option3);
            // var bb = network.getSelection();
            // var cc= bb;
            //});
          }

           if(scope.panel.chart === 'bars'){
             var islength = 0;
             if(data_data.length>5){
               islength =1;
             }

             myChart = echarts.init(document.getElementById(idd));
             var option5 = {
               tooltip: {
                 trigger: 'axis',
                 confine:true,
                 axisPointer: {
                   type: 'none'
                 },
                 formatter: function(params) {
                   return params[0].name + ': ' + params[0].value;
                 }
               },
               color:['#1a75f9', '#1ab0f9', '#42d3f0', '#e59d87', '#759aa0', '#dc6b67', '#efdd79', '#8dc1aa', '#ea7d52', '#8dace7', '#a6a1e1', '#FECDA3', '#FED980','#bcf924','#f9ac24','#8224f9','#24e5f9','#f96524'],
               grid: {
                 left: '0%',
                 right: '3%',
                 bottom: '3%',
                 top: '3%',
                 containLabel: true
               },
               xAxis: {
                 data: x_data,
                 axisTick: {
                   show: false
                 },
                 axisLine: {
                   show: false
                 },
                 axisLabel: {
                   show:true,
                   textStyle:{
                     color:labelcolor ? '#fff':'#4F4F4F',
                     fontSize:scope.panel.fontsize,
                   }
                 }
               },
               yAxis: {
                 splitLine: {
                   show: false
                 },
                 axisTick: {
                   show: false
                 },
                 axisLine: {
                   show: false
                 },
                 axisLabel: {
                   show: true,
                   margin:52,
                   textStyle:{
                     color:labelcolor ? '#DCDCDC':'#4F4F4F',
                     fontSize:scope.panel.fontsize+2,
                     fontStyle: 'italic'
                   }
                 }
               },
               //color: ['#1a75f9', '#1a93f9', '#1ab0f9', '#1acef9', '#42d3f0', '#e59d87', '#759aa0', '#dc6b67', '#efdd79', '#8dc1aa', '#ea7d52', '#8dace7', '#a6a1e1', '#FECDA3', '#FED980'],
               series: [{
                 name: scope.panel.title,
                 type: 'pictorialBar',
                 barCategoryGap: islength?'-60%':'-10%',
                 symbolSize:['120%','100%'],
                 // symbol: 'path://M0,10 L10,10 L5,0 L0,10 z',
                 symbol: 'path://M0,10 L10,10 C5.5,10 5.5,5 5,0 C4.5,5 4.5,10 0,10 z',
                 itemStyle: {
                   normal: {
                     color: function(params) {
                       var colorList = ['#1a75f9', '#1ab0f9', '#42d3f0', '#e59d87', '#759aa0', '#dc6b67', '#efdd79', '#8dc1aa', '#ea7d52', '#8dace7', '#a6a1e1', '#FECDA3', '#FED980','#bcf924','#f9ac24','#8224f9','#24e5f9','#f96524'];
                       return colorList[params.dataIndex];
                     },
                     shadowColor: '#fff',
                     barBorderRadius: 5,
                     opacity: 0.8

                   },
                   emphasis: {
                     opacity: 1
                   }
                 },
                 data: data_data,
                 z: 10
               }]
             };
               myChart.setOption(option5);



           }


        });
        }
      }
    };
  });

});
