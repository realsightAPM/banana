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
    'd3',
    'fisheye'

  ],
  function (angular, app, _, $, kbn) {
    'use strict';

    var module = angular.module('kibana.panels.network', []);
    app.useModule(module);

    module.controller('fisheyescatter', function($scope, $http,$sce,$timeout, $translate,timer, querySrv, dashboard, filterSrv) {
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
        panelExpand:true,
        fullHeight:'700',
        useInitHeight:true,
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
        // $('.fullscreen-link').on('click', function () {
        //   var ibox = $(this).closest('div.ibox1');
        //   var button = $(this).find('i');
        //
        //   $('body').toggleClass('fullscreen-ibox1-mode');
        //   button.toggleClass('fa-expand').toggleClass('fa-compress');
        //   ibox.toggleClass('fullscreen');
        //   $scope.panel.useInitHeight=!$scope.panel.useInitHeight;
        //   $scope.$emit('render');
        //
        //   $(window).trigger('resize');
        //
        // });
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
      $scope.reSize=function() {

        $scope.panel.useInitHeight=!$scope.panel.useInitHeight;

        var ibox = $('#'+$scope.$id+'z').closest('div.ibox1');
        var button = $('#'+$scope.$id+'z').find('i');
        //var aaa = '#'+$scope.$id+'z';
        $('body').toggleClass('fullscreen-ibox1-mode');
        button.toggleClass('fa-expand').toggleClass('fa-compress');
        ibox.toggleClass('fullscreen');
        $scope.panel.fullHeight = ibox[0].offsetHeight-60;
        $scope.$emit('render');
        $(window).trigger('resize');


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
        //同id 图表刷新，图表自身点击不刷新，时间选择全局刷新，更换应用刷新
        if((($scope.panel.linkage_id === dashboard.current.linkage_id))||dashboard.current.enable_linkage) {
          $scope.query_url = "http://" + $scope.panel.HbaseIP + "/getScatterData.pinpoint?to="+dashboard.current.timeto+"&from="+dashboard.current.timefrom+"&limit=5000&filter=&application="+dashboard.current.network_app_name+"&xGroupUnit=987&yGroupUnit=1";
          //$scope.query_url = "http://" + $scope.panel.HbaseIP + "/getScatterData.pinpoint?to=1500275616000&from=1500275316000&limit=5000&filter=&application=chartsshow&xGroupUnit=987&yGroupUnit=1"+dashboard.current.network_app_name+"&from=" + dashboard.current.timefrom + "&to=" + dashboard.current.timeto + "&callerRange=1&calleeRange=1&serviceTypeName=TOMCAT";
          $.getJSON($scope.query_url, function (json) {
            $scope.data = json;
            //dashboard.current.hbasedata = json;
            //dashboard.current.network_force_refresh = false;
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

    module.directive('fisheyescatterChart', function(querySrv,dashboard,filterSrv,$translate) {
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
            var divHeight=scope.panel.height||scope.row.height;
            if(!scope.panel.useInitHeight){
              divHeight = scope.panel.fullHeight;
            }
            elem.css({height:divHeight});

            // Make a clone we can operate on.

            elem.html("");

            var el = elem[0];
            if (filterSrv.idsByTypeAndField('pies',scope.panel.field).length > 0) {
              colors.push(scope.panel.lastColor);
            } else {
              colors = scope.panel.chartColors;
            }
            var cloneData = scope.data;
            cloneData.scatter.dotList.reverse();
            var idd = scope.$id;
            var labelcolor = false;
            var d3_label_color = "black";
            if (dashboard.current.style === 'dark'||dashboard.current.style === 'black'){
              labelcolor = true;
              var d3_label_color = "white";

            }
            var x;
            var y;
            var radius;
            var color;
            var position;
            // Add plot to scope so we can build out own legend

            if(scope.panel.chart === 'network') {

              var time ;
              var timeData = [];
              var max_data=0;
              // 获取fisheye图表数据
              var fisheye_data=[];
              //x轴以每分钟作为间隔
              var time_from_to=(dashboard.current.timeto-dashboard.current.timefrom)/60000;

              //将接口数据转化为图表所需数据
              for(var i1=0;i1<cloneData.scatter.dotList.length;i1++){
                if(max_data<cloneData.scatter.dotList[i1][1]){
                  max_data=cloneData.scatter.dotList[i1][1];
                }
                timeData[i1] = cloneData.scatter.dotList[i1][0]/60000;
                fisheye_data[i1] = {name:$translate.instant("Time")+cloneData.scatter.dotList[i1][1]+"ms",time:cloneData.scatter.dotList[i1][0]/60000,value:cloneData.scatter.dotList[i1][1],status:cloneData.scatter.dotList[i1][4],radius:cloneData.scatter.dotList[i1][4]}

              }
              //timeData.sort();
              //x轴为时间，y轴为对应值，radius函数返回点大小，color函数返回点颜色
              x=function(d){return d.time;}
              y=function(d){return d.value;}
              radius=function(d){return d.radius;}
              color=function(d){return d.status;}
              position=function(dot){
                dot .attr("cx", function(d) { return xScale(x(d)); })
                  .attr("cy", function(d) { return yScale(y(d)); })
                  .attr("r", function(d) { return radiusScale(radius(d)); });
              }


              // Chart dimensions.
              var margin = {top: 5.5, right: 19.5, bottom: 12.5, left: 39.5},
                width = 0.96*elem.parent().width(),
                height = parseInt(divHeight) - margin.top - margin.bottom;

              // Various scales and distortions.
              var xScale = d3.fisheye.scale(d3.scale.log).domain([time_from_to,timeData[0]]).range([0, width]),
                yScale = d3.fisheye.scale(d3.scale.linear).domain([0, max_data]).range([height, 0]),
                radiusScale = d3.scale.sqrt().domain([0, 80]).range([1, 25]),
                colorScale = d3.scale.category20c().domain([0, 1]);

              // The x & y axes.
              var xAxis = d3.svg.axis().orient("bottom").scale(xScale).tickFormat(d3.format(",d")).tickSize(-height),
                yAxis = d3.svg.axis().scale(yScale).orient("left").tickSize(-width);

              // Create the SVG container and set the origin.
              var svg = d3.select(el).append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

              // Add a background rect for mousemove.
              svg.append("rect")
                .attr("class", "background")
                .attr("width", width)
                .attr("height", height);

              // Add the x-axis.
              svg.append("g")
                .attr("class", "x axis")
                .attr("fill",d3_label_color)
                .attr("transform", "translate(0," + height + ")")
                .call(xAxis);

              // Add the y-axis.
              svg.append("g")
                .attr("class", "y axis")
                .attr("fill",d3_label_color)
                .call(yAxis);

              // Add an x-axis label.
              svg.append("text")
                .attr("fill",d3_label_color)
                .attr("font-size", 20)
                .attr("x", width-20 )
                .attr("y", height+11)
                .text($translate.instant("Interval")+"(min)");

              // Add a y-axis label.
              svg.append("text")
                .attr("fill",d3_label_color)
                .attr("font-size", 20)
                .attr("text-anchor", "end")
                .attr("x",2)
                .attr("y",2)
                .text($translate.instant("Time")+"(ms)");

              // Load the data.


                // Add a dot per nation. Initialize the data at 1800, and set the colors.
                var dot = svg.append("g")
                  .attr("class", "dots")
                  .selectAll(".dot")
                  .data(fisheye_data)
                  .enter().append("circle")
                  .attr("class", "dot")
                  .style("fill", function(d) { return colorScale(color(d)); })
                  .call(position)
                  .sort(function(a, b) { return radius(b) - radius(a); });

                // Add a title.
                dot.append("title")
                  .text(function(d) { return d.name; });

                // Positions the dots based on data.

                svg.on("mousemove", function() {
                  var mouse = d3.mouse(this);
                  xScale.distortion(2.5).focus(mouse[0]);
                  yScale.distortion(2.5).focus(mouse[1]);

                  dot.call(position);
                  svg.select(".x.axis").call(xAxis);
                  svg.select(".y.axis").call(yAxis);
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
