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

  module.controller('topologystacking', function($scope, $http,$sce,$timeout, $translate,timer, querySrv, dashboard, filterSrv) {
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
      chartColors : ['#2fd7ee','#1a93f9','#52f4c0', '#8cf452','#f4d352','#f48a52','#FF4500', '#ff7a00' ],
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
      if(dashboard.current.network_bar_show) {
        if (($scope.panel.linkage_id === dashboard.current.linkage_id) || dashboard.current.enable_linkage) {
          if (dashboard.current.hbasedata == null || _.isUndefined(dashboard.current.hbasedata)) {
            $scope.query_url = "http://" + $scope.panel.HbaseIP + "/getServerMapData.pinpoint?applicationName=" + dashboard.current.network_app_name + "&from=" + dashboard.current.timefrom + "&to=" + dashboard.current.timeto + "&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT";
            $.getJSON($scope.query_url, function (json) {
              dashboard.current.hbasedata = json;
              for (var i1 = 0; i1 < dashboard.current.hbasedata.applicationMapData.nodeDataArray.length; i1++) {
                if (dashboard.current.hbasedata.applicationMapData.nodeDataArray[i1].applicationName === dashboard.current.network_app_name) {
                  $scope.data = dashboard.current.hbasedata.applicationMapData.nodeDataArray[i1].timeSeriesHistogram;
                  break;
                }
              }
              $scope.$emit('render');
            });
          } else {
            for (var i1 = 0; i1 < dashboard.current.hbasedata.applicationMapData.nodeDataArray.length; i1++) {
              if (dashboard.current.hbasedata.applicationMapData.nodeDataArray[i1].key === dashboard.current.network_node_id) {
                $scope.data = dashboard.current.hbasedata.applicationMapData.nodeDataArray[i1].timeSeriesHistogram;
                break;
              }
            }
            $scope.$emit('render');
          }


        }
      }else{
        if (($scope.panel.linkage_id === dashboard.current.linkage_id) || dashboard.current.enable_linkage) {
          $scope.query_url = "http://" + $scope.panel.HbaseIP + "/getServerMapData.pinpoint?applicationName=" + dashboard.current.network_app_name + "&from=" + dashboard.current.timefrom + "&to=" + dashboard.current.timeto + "&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT";
          $.getJSON($scope.query_url, function (json) {
            dashboard.current.hbasedata = json;
            for (var i1 = 0; i1 < dashboard.current.hbasedata.applicationMapData.nodeDataArray.length; i1++) {
              if (dashboard.current.hbasedata.applicationMapData.nodeDataArray[i1].applicationName === dashboard.current.network_app_name) {
                $scope.data = dashboard.current.hbasedata.applicationMapData.nodeDataArray[i1].timeSeriesHistogram;
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

  module.directive('topologystackingChart', function(querySrv,dashboard,filterSrv) {
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
          if (dashboard.current.style === 'dark'){
              labelcolor = true;
          }
                // Add plot to scope so we can build out own legend
          Date.prototype.pattern = function (fmt) {
            var o = {
              "M+" : this.getMonth() + 1, //月份
              "d+" : this.getDate(), //日
              "h+" : this.getHours() % 12 === 0 ? 12 : this.getHours() % 12, //小时
              "H+" : this.getHours(), //小时
              "m+" : this.getMinutes(), //分
              "s+" : this.getSeconds(), //秒
              "q+" : Math.floor((this.getMonth() + 3) / 3), //季度
              "S" : this.getMilliseconds() //毫秒
            };
            var week = {
              "0" : "/u65e5",
              "1" : "/u4e00",
              "2" : "/u4e8c",
              "3" : "/u4e09",
              "4" : "/u56db",
              "5" : "/u4e94",
              "6" : "/u516d"
            };
            if (/(y+)/.test(fmt)) {
              fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
            }
            if (/(E+)/.test(fmt)) {
              fmt = fmt.replace(RegExp.$1, ((RegExp.$1.length > 1) ? (RegExp.$1.length > 2 ? "/u661f/u671f" : "/u5468") : "") + week[this.getDay() + ""]);
            }
            for (var k in o) {
              if (new RegExp("(" + k + ")").test(fmt)) {
                fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
              }
            }
            return fmt;
          };
          var echarts = require('echarts');
         // require(['vis'], function(nw){
          if(myChart) {
            myChart.dispose();
          }
          if(scope.panel.chart === 'network') {


            var series = [];
            var label=[];
            var timeData=[];
            var values =[];
           // var date_value=[];


            for(var i = 0;i<scope.data.length;i++){
              for (var i1 = 0;i1<scope.data[i].values.length;i1++){
                timeData[i1] = new Date(scope.data[i].values[i1][0]);
                timeData[i1] =timeData[i1].pattern("yyyy-MM-dd hh:mm:ss");
                values[i1]=scope.data[i].values[i1][1];
              }
              label[i] = scope.data[i].key;
              series[i]={name:label[i],type:'line',areaStyle: {normal: {opacity:0.6}},data: values};
              values=[];
            }

            myChart = echarts.init(document.getElementById(idd));
            var option = {

              tooltip: {
                trigger: 'axis',
                confine:true,
                axisPointer: {
                  animation: false
                }
              },
              color:scope.panel.chartColors,
              legend: {
                textStyle:{
                  color:labelcolor?'#DCDCDC':'#696969'
                },
                data:label
              },
              toolbox: {
                feature: {
                  dataZoom: {
                    yAxisIndex: 'none'
                  },
                  dataView: {readOnly: false},
                  restore: {}
                }
              },

              grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
              },
              xAxis : [
                {
                  type : 'category',
                  boundaryGap : false,
                  axisLine: {onZero: true},
                  axisLabel:{
                    textStyle:{
                      color:labelcolor?'#DCDCDC':'#696969'
                    }
                  },
                  data :timeData
                }
              ],
              yAxis : [
                {
                  type : 'value',
                  name : '',
                  min :0,
                  nameTextStyle:{
                    color:labelcolor?'#DCDCDC':'#696969'
                  },
                  axisLine:{
                    lineStyle:{
                      color:'#46474C'
                    }
                  },
                  splitLine:{
                    lineStyle:{
                      color:['#46474C']
                    }
                  },
                  axisLabel:{
                    textStyle:{
                      color:labelcolor?'#DCDCDC':'#696969'
                    }
                  }
                }
              ],
              series : series
            };
            myChart.setOption(option);

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
