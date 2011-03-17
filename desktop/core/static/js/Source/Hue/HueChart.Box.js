/*
---

script: HueChart.Box.js

description: Defines HueChart.Box, which builds on HueChart and serves as a base class to build charts which are rectangular in nature, having x and y axes.

license: MIT-style license

authors:
- Marcus McLaughlin

requires:
- protovis/Protovis
- More/Date
- More/Tips
- Core/Events
- Core/Options
- /Number.Files
- /HueChart

provides: [ HueChart.Box ]
...
*/
(function() {
var getXValueFn = function(field) {
		return function(data) {
				if (field) return data[field];
				else return data;
		};
};

/*
	HueChart.Tips
		Small extension to HueChart.
		Issue is that HueChart.Box needs complete control over the hiding and showing of tips.
		Tips, by default, shows a tip whenever the element in question is rolled over.
		Adding this parameter, means that the Tips.show method will only
		 be called when it is present, and it isn't present in the Tips.elementEnter invocation of			Tips.show.
*/
HueChart.Tips = new Class({
	Extends: Tips,

	options: {
		showDelay: 0,
		hideDelay: 0
	},

	show: function(element, actualShow) {
		if (actualShow) this.parent(element);
	}
});

HueChart.Box = new Class({

		Extends: HueChart,

		 options: {
				xProperty: 'x', //the field in the data table which should be used for determining where points are on the xAxis
				dates: {x: false, y: false}, //is the data in an axis a date ? 
				dateSpans:{x: null}, //if an axis is a date, what time span should the tick marks for that axis be shown in
				positionIndicator: false, //should the position indicator be shown ?
				ticks: {x: false, y: false, orientation: 'absolute', shortenY: true}, //should tick marks be shown ?
					//Orientation options are:
						// 'absolute' -- meaning they are actual dates
						// 'relative' -- meaning they are timespans from the first date
				showLabels: false, //should axis labels be shown ?
				tickColor: "#555", //the color of the tick marks
				tickDateFormats: {
					'ms': "%I:%M:%z %p",
					'second': "%I:%M %p",
					'minute': "%I:%M %p",
					'hour': "%I %p",
					'day': "%b %D",
					'month': "%m",
					'year': "%Y"
				},
				dateFormat: "%b %d", //the format that should be used when displaying dates
				verticalTickSpacing: 35, //the distance between vertical ticks
				xTickHeight: 10, //the height of the xTick marks.
				labels:{x:"X", y: "Y"}, //the labels that should be used for each axis
				selectBarColor: "rgba(0, 0, 0, .2)", //the color that should be used to fill selections in this chart
				selectBarBorderColor: "rgba(0, 0, 0, 1)", //the color that should be used as a border for selections in this chart
				selectedIndicatorColor: "black", //color that should be used to show the position of the selected index, when using the position indicator
				highlightedIndicatorColor: "rgba(255, 255, 255, .5)",
				yType: 'string', //the type of value that is being graphed on the y-axis,
				showPointValue: false, //show the value at the point when moused over
				selectable: false, //make the chart selectable
				//initialSelectValue: {left: 0, right: 0}, //the initial chart selection, must be same type as x values 
				draggable: false, //make the chart selection draggable,
				fireSelectOnDrag: true //fires the select event on completion of a drag
				/*
				onPointMouseOut: function that should be run when the mouse is moved out of the chart
				onPointMouseOver: function that should be run when the mouse is moved over a datapoint, takes the dataPoint and index as arguments
				onPointClick: function that should be run when the mouse is clicked on a datapoint, takes the dataPoint and index as arguments
				onSeriesMouseOver: function that should be run when the mouse is moved over a dataSeries, takes an object containing the seriesName and value at that point as argument.
				onSeriesClick: function that should be run when the mouse is clicked on a data series, takes an object containing the seriesName and value at that as an argument.
				onSpanSelect: function that should be run when a segment of the chart is selected.  Takes a left object and a right object as arguments, each of which contains the corresponding index and data object. 
				*/
		},
		
		initialize: function(element, options) {
				this.parent(element, options);
				this.selected_index = -1;
				this.highlighted_index = -1;
				//Build initial list of data series
				//Initialize data object
				if (this.hasData()) this.initializeData(this.options.metadata);
				//Create tip to show if showPointValue is true.
				if (this.options.showPointValue) {
						this.tip = new HueChart.Tips(this.element, {
								className: 'huechart tip-wrap',
								title: $lambda("Title"),
								text: $lambda("Text")
						});
						this.tip.hide();
						this.addEvent('seriesMouseOver', this.updatePointValue);
				}
				//Initialize dragState and selectState
				this.dragState = {x: 0, y: 0};
				this.selectState = {x: 0, dx: 0};
				//Set this.draggable and this.selectable to reflect whether or not the chart has these capabilities, based on the existence of events and/or options.
				this.draggable = this.options.draggable || this.hasEvent('drag') || this.hasEvent('dragStart') || this.hasEvent('dragEnd');
				this.selectable = this.options.selectable || this.draggable || this.hasEvent('spanSelect') || this.hasEvent('select') || this.hasEvent('selectStart') || this.hasEvent('selectEnd');
				//When the setupChart event is fired, the full ProtoVis visualization is being set up, in preparation for render.
				//The addGraph function is responsible for adding the actual representation of the data, be that a group of lines, or a group of area graphs.
				this.addEvent('setupChart', function(vis) {
						if(this.hasData()) {
							//Set up the scales which will be used to convert values into positions for graphing.
							this.setScales(vis);
							//Add tick marks (rules on side and bottom) if enabled
							if (this.options.ticks.x || this.options.ticks.y) this.setTicks(vis);
							//Add axis labels if enabled
							if (this.options.showLabels) this.setLabels(vis);
							//Add position indicator if enabled
							if (this.options.positionIndicator) this.setPositionIndicators(vis);
							//Add representation of the data.
							this.addGraph(vis);
							//Create panel for capture of events
							this.eventPanel = vis.add(pv.Panel).fillStyle("rgba(0,0,0,.001)");
							//If there's a mouse event, add the functionality to capture these events.
							if (this.hasEvent('pointMouseOut') && this.hasEvent('pointMouseOver') || this.hasEvent('pointClick') || this.options.showPointValue) this.addMouseEvents(vis);
							//If there is a selection or drag event of any sort make the graph selectable.
							if (this.selectable) this.makeSelectable(vis);
							vis.render();
						} else {
							this.renderHasNoData();
						}
				}.bind(this));
		},
		
		//Redefining to reflect the fact that one data point is not sufficient to render a line
		hasData: function() {
			return this.getData().getLength() > 1;
		},

		initializeData: function(metadata) {
				if (metadata) {
					 this.metadata = metadata;
					 this.series = Hash.getKeys(metadata);
				} else {
					delete this.metadata;
					this.series = [];
					//Initialize dataSeries
					dataObjs = this.getData(true).getObjects();
					//Iterate through the data objects to create a list of the data series.
					dataObjs.each(function(obj) {
						Hash.each(obj, function(value, key) {
							if (!this.series.contains(key) && key != this.options.xProperty) this.series.push(key);
						}.bind(this));
					}.bind(this));
				}
				if(this.options.dates.x) {
						//If the xProperty is a date property, prepare the dates for sorting
						//Change the xProperty to the new property designed for sorting dates
						this.getData(true).prepareDates(this.options.xProperty);
						//Set dateProperty to the initial xProperty, this will hold a date object which will be used for rendering dates as strings
						this.dateProperty = this.options.xProperty;
						this.xProperty = 'ms';
				} else {
						//Otherwise sort by the x property.
						this.xProperty = this.options.xProperty;
						this.getData(true).sortByProperty(this.xProperty);
				}
		},
		
		//If series is not defined, returns true if there is metadata defined for the chart, false otherwise.
		//If series is defined, returns true if there is metadata defined for the chart and within that metadata there is an entry for the series in question.
		hasMetadata: function(series) {
			var hasMeta = $defined(this.metadata);
			if ($defined(series)) {
				hasMeta = hasMeta & Hash.has(this.metadata, series);
			}
			return hasMeta;
		},

		//Add data -- redefined to add series to the array of series
		addData: function(data) {
			var added = this.parent(data, this.dateProperty);
			if (added) {
			    var firstObj = data[0];
				Hash.each(firstObj, function(value, key) {
					if (key != this.dateProperty){
						if (!this.series.contains(key)) this.series.push(key);
					}
			    }.bind(this));
			}
		},
		
		//Set the scales which will be used to convert data values into positions for graph objects
		setScales: function(vis) {
				//Get the minimum and maximum x values.
				var xMin = this.hasMetadata('chartStartTime') ? this.metadata.chartStartTime : this.getData(true).getMinValue(this.xProperty);
				var xMax = this.hasMetadata('chartEndTime') ? this.metadata.chartEndTime : this.getData(true).getMaxValue(this.xProperty);
				//Get the maximum of the values that are to be graphed
				var maxValue = this.getData(true).getMaxValue(this.series);
				this.xScale = pv.Scale.linear(xMin, xMax).range(this.options.leftPadding, this.width - this.options.rightPadding);
				this.yScale = pv.Scale.linear(0, maxValue * 1.2).range(this.options.bottomPadding, (this.height - (this.options.topPadding)));
				//Defining a yValueReverse function here, since it is so closely related to the scale.
				//This function reverses a value returned by yScale.invert to a value that corresponds to the scale from 0 to maxValue, rathen than from maxValue to 0.
				this.yValueReverse = function(reversedValue) {
						var paddingBasedDifference = this.yScale.invert(this.options.bottomPadding - this.options.topPadding) - this.yScale.invert(0);
						return ((reversedValue - maxValue * 1.2) * -1) - paddingBasedDifference;
				};
		},
		
		//Returns fn to control the tick label string
		_getXTickDisplayFn: function(xTicks, tickOrientation, getXValue) {
			//Function will return the correct xValue dependent on whether or not x is a date
			//Define getTickLabel function based on possible states.
			if (this.options.dates.x) {
				var dateProperty = this.dateProperty;
				//If these are absolute dates, just show the date and use the default getValue fn.
				if (tickOrientation == 'absolute') {
					var tickFormat = this.options.tickDateFormats[xTicks.unit];
					return function(d) {
						return d[dateProperty].format(tickFormat);
					};
				}
				//If they are relative dates
				if (tickOrientation == 'relative') {
					return function(d) {
						return d.label;
					};
				}
			} else {
				return function(d) {
					return getXValue(d);
				};
			}
		},
		//Draw the X and Y tick marks.
		setTicks:function(vis) {

				if (this.options.ticks.x) {
						//Add X-Ticks.
						//Create tick array.
						var tickOrientation = this.options.ticks.orientation;
						var tickMethod = 'get' + tickOrientation.capitalize() + 'Ticks';
						var chartStart = null, chartEnd = null;
						if (this.hasMetadata()) {
							chartStart = this.metadata.chartStartTime;
							chartEnd = this.metadata.chartEndTime;
						}
						var xTicks = (this.options.dates.x ? this.getData(true)[tickMethod](10, this.dateProperty, chartStart, chartEnd) : this.xScale.ticks(7));
						var getValue = getXValueFn(this.options.dates.x ? this.xProperty : null);
						var getTickLabel = this._getXTickDisplayFn(xTicks, tickOrientation, getValue);
						//Create rules (lines intended to denote scale)
						vis.add(pv.Rule)
								//Use the tick array as data.
								.data(xTicks.ticks)
								//The bottom of the rule should be at the bottomPadding - the height of the rule.
								.bottom(this.options.bottomPadding - this.options.xTickHeight)
								//The left of the rule should be at the data object's xProperty value scaled to pixels.
								.left(function(d) { return this.xScale(getValue(d)); }.bind(this))
								//Set the height of the rule to the xTickHeight
								.height(this.options.xTickHeight)
								.strokeStyle(this.options.tickColor)
								//Add label to bottom of each rule
								.anchor("bottom").add(pv.Label)
										.text(function(d) { return getTickLabel(d);}.bind(this));
				}
				if (this.options.ticks.y) {
						//Add Y-Ticks
						//Calculate number of yTicks to show.
						//Approximate goal of 35 pixels between yTicks.
						var yTickCount = (this.height - (this.options.bottomPadding + this.options.topPadding))/this.options.verticalTickSpacing;
						//In some box-style charts, there is a need to have a different scale for yTicks and for y values.
						//If there is a scale defined for yTicks, use it, otherwise use the standard yScale.
						var tickScale = this.yScaleTicks || this.yScale;
						var ticks = tickScale.ticks(yTickCount > 1 ? yTickCount : 2);
						//Convert ticks to tickObject containing value and label
						ticks = ticks.map(function(tick) {
							var tickObject = {};
							tickObject.value = tick;
							var label = tick;
							if (this.options.yType == 'bytes') {
								label = tick.convertFileSize();
							} else {
								if(this.options.ticks.shortenY) label = tick.shortString();
							};
							tickObject.label = label;
							return tickObject;
						}.bind(this));
						//Create rules
						vis.add(pv.Rule)
								//Always show at least two ticks.
								//tickScale.ticks returns an array of values which are evenly spaced to be used as tick marks.
								.data(ticks)
								//The left side of the rule should be at leftPadding pixels.
								.left(this.options.leftPadding)
								//The bottom of the rule should be at the tickScale.ticks value scaled to pixels.
								.bottom(function(tick) {return tickScale(tick.value);}.bind(this))
								//The width of the rule should be the width minus the hoizontal padding.
								.width(this.width - this.options.leftPadding - this.options.rightPadding + 1)
								.strokeStyle(this.options.tickColor)
								//Add label to the left which shows the number of bytes.
								.anchor("left").add(pv.Label)
										.text(function(tick) { return tick.label; });
				}
		},
		
		//Add X and Y axis labels.
		setLabels: function(vis) {
				//Add Y-Label to center of chart.
				vis.anchor("center").add(pv.Label)
						.textAngle(-Math.PI/2)
						.text(this.options.labels.y)
						.font(this.options.labelFont)
						.left(12);
				
				//Add X-Label to center of chart.
				vis.anchor("bottom").add(pv.Label)
						.text(this.options.labels.x)
						.font(this.options.labelFont)
						.bottom(0);
		},

		//Add bars which indicate the positions which are currently selected and/or highlighted on the box graph.
		setPositionIndicators: function(vis) {
				//Put selected_index and highlighted_index in scope.
				get_selected_index = this.getSelectedIndex.bind(this);
				get_highlighted_index = this.getHighlightedIndex.bind(this);
				var selectedColor = this.options.selectedIndicatorColor;
				var highlightedColor = this.options.highlightedIndicatorColor;
				//Add a thin bar which is approximately the height of the graphing area for each item on the graph.
				vis.add(pv.Bar)
						.data(this.getData(true).getObjects())
						.left(function(d) { 
								return this.xScale(d[this.xProperty]); 
						}.bind(this))
						.height(this.height - (this.options.bottomPadding + this.options.topPadding))
						.bottom(this.options.bottomPadding)
						.width(2)
						//Show bar if its index is selected or highlighted, otherwise hide it.
						.fillStyle(function() {
								if (this.index == get_selected_index()) return selectedColor;
								if (this.index == get_highlighted_index()) return highlightedColor;
								else return null;
						});
		},

		getDataIndexFromPoint: function(axis, x) {
				if(axis == 'x') {
						//Convert the passedin in xValue into its corresponding data value on the xScale. 
						var mx = this.xScale.invert(x);
						//Search the data for the index of the element at this data value.
						var i = pv.search(this.getData(true).getObjects().map(function(d){ return d[this.xProperty]; }.bind(this)), Math.round(mx));
						//Adjust for ProtoVis search
						i = i < 0 ? (-i - 2) : i;
						return (i >= 0 && i < this.getData(true).getLength() ? i : null);
				}
		},

		invertYValue: function(y) {
			return this.yScale.invert(y);
		},

		getYRange: function(y, inversionScale) {
				var yBuffer = 5; //Pixel buffer for usability.
				//Must use yValueReverse to reverse the mouse value because drawing happens from the bottom up.  Mouse position is from the top down.
				var invertedYValue = this.invertYValue(y);
				//Since range will be inverted, the array goes from greatest to least initially.
				var invertedYRange = [this.invertYValue(y + yBuffer), this.invertYValue(y - yBuffer)];
				var yValue = this.yValueReverse(invertedYValue);
				//Convert the inverted yRange to a non-inverted yRange.
				var yRange = invertedYRange.map(function(value) { return this.yValueReverse(value); }.bind(this));
				return yRange;
		},

		getDataSeriesFromPointAndY: function(dataPoint, y) {
				var yRange = this.getYRange(y);
				var seriesList = [];
				//Find closest y-values
				for (var i = 0; i < this.series.length; i++) {
						var item = this.series[i];
						if(yRange[0] < dataPoint[item] && dataPoint[item] < yRange[1]) {
								seriesList.push({'name': item, 'value': dataPoint[item]});
						}
				}
				return seriesList;
		},
		 
		//Add handlers to detect mouse events.
		addMouseEvents: function(vis) {
				//Function that controls the search for data points and fires mouse positioning events. 
				var mousePositionEvent = function(eventName, position) {
						var dataIndex = this.getDataIndexFromPoint('x', position.x);
						if(dataIndex != null) {
								var dataPoint = this.getData(true).getObjects()[dataIndex];
								this.fireEvent('point' + eventName.capitalize(), [ dataPoint, dataIndex ]);
								var dataSeries = this.getDataSeriesFromPointAndY(dataPoint, position.y);
								this.fireEvent('series' + eventName.capitalize(), [dataSeries]);
						}
				}.bind(this);
				//Create functions which handle the graph specific aspects of the event and call the event arguments.
				var outVisFn = function() {
						this.fireEvent('pointMouseOut');
						return vis;
				}.bind(this);
				var moveVisFn = function() {
						mousePositionEvent('mouseOver', vis.mouse());
						return vis;
				}.bind(this);
				var clickFn = function() {
						//Only click if the movement is clearly not a drag.
						if (!this.selectState || this.selectState.dx < 2) {
								mousePositionEvent('click', vis.mouse());
								return vis;
						}
				}.bind(this);

				
				this.eventPanel
						.events("all")
						.event("mouseout", outVisFn)
						.event("mousemove", moveVisFn)
						.event("click", clickFn);

		},
		
		//Given points on an axis, return an array of data objects for each point
		getObjectsForPoints: function(axis /*points*/) {
				var argArray = $A(arguments).slice(1);
				return argArray.map(function(point) {
						var toGraph = this.adjustToGraph(axis, point);
						var index = this.getDataIndexFromPoint(axis, toGraph);
						var pointValue = this.getValueFromPoint(axis, point);
						return { index: index, data: this.getData(true).getObjects()[index], pointValue: pointValue };
				}.bind(this));
				
		},
		
		getValueFromPoint: function(axis, point) {
			switch (axis) {
				case 'x':
					return this.xScale.invert(point);
					break;
				case 'y':
					return this.invertYValue(point);
					break;
			}
		},
		
		//Make selection in graph draggable
		makeSelectionDraggable: function() {
				//Attach the ProtoVis drag behavior to the select bar and attach events for drag occurrences
				this.selectBar = this.selectBar 
				//Set cursor to be a mouse pointer
				.cursor("move")
				.event("mousedown", pv.Behavior.drag())
						.event("drag", function() {
								this.fireEvent('drag');
						}.bind(this))
						.event("dragstart", function() {
								this.fireEvent('dragStart');
						}.bind(this))
						.event("dragend", function() {
								if (this.options.fireSelectOnDrag) {
										//Get objects for edge points
										var leftPoint = this.dragState.x;
										var rightPoint = this.dragState.x + this.selectWidth;
										var objectArray = this.getObjectsForPoints('x', leftPoint, rightPoint);
										this.fireEvent('spanSelect', objectArray);
								}
								this.fireEvent('dragEnd');
						}.bind(this));
		},
		
		//Make graph selectable
		makeSelectable: function(){
				//Create select bar
				this.selectBar = this.eventPanel.add(pv.Bar);
				
				//If there is a need for draggability, make the selection draggable.
				if (this.draggable) this.makeSelectionDraggable();
				
				//Set the basic settings for the selectBar 
				this.selectBar = this.selectBar
								//Initialize dragState as selectBar's data.
								.data([this.dragState])
								//Set fillStyle to the selectBarColor
								.fillStyle(this.options.selectBarColor)
								//Set height so that it only covers the chart
								.height(this.height - (this.options.bottomPadding + this.options.topPadding))
								//Set top to start at top padding
								.top(this.options.topPadding)
								//Set line width to 1 pixel
								.lineWidth(1)
								//Set the left value to the dragState's x value.
								.left(function(d) {
										return d.x;
								});
				
				//Initialize selection to nothing
				this.selectPixelRange(0, 0);
				//If the initialSelectValue has been set, select that range.
				if(this.options.initialSelectValue) {
						this.selectRange(this.options.initialSelectValue.start, this.options.initialSelectValue.end);
				}
				//Initialize eventPanel's select events.
				this.eventPanel
						.data([this.selectState])
						.event("mousedown", pv.Behavior.select());
						 
				//If d.dx has a value greater than 0...meaning we're in the middle of a
				//drag, adjust the width value to the graph.
				//Otherwise give it a width of 0.
				this.eventPanel
						.event("selectstart", function() {
								this.selectBar.width(0);
								this.selectBar.strokeStyle(this.options.selectBarBorderColor);
								this.fireEvent('selectStart');
						}.bind(this))
						.event("select", function() {
								this.selectPixelRange(this.adjustToGraph('x', this.selectState.x), this.adjustToGraph('x', this.selectState.x + this.selectState.dx));
								this.fireEvent('select');
						}.bind(this))
						.event("selectend", function() {
								if (this.selectState.dx > 2) {
										//Get objects for edge points
										//left - this.selectState.x
										//right - this.selectState.dx
										var objectArray = this.getObjectsForPoints('x', this.selectState.x, this.selectState.x + this.selectState.dx);
										this.fireEvent('spanSelect', objectArray);
								}
								this.fireEvent('selectEnd');
						}.bind(this));
		},
		
		//Selects a pixel range in the graph.
		selectPixelRange: function(leftValue, rightValue) {
				this.dragState.x = this.adjustToGraph('x', leftValue);
				this.selectWidth = rightValue - leftValue;
				this.selectBar
						.width(rightValue - leftValue);
		},
		
		//Selects a range in the graph based on the x value
		selectRange: function(leftValue, rightValue) {
				//Convert to points on xScale
				startX = this.xScale(leftValue);
				endX = this.xScale(rightValue);
				this.selectPixelRange(startX, endX);
				this.selectBar.strokeStyle(this.options.selectBarBorderColor);
		},

		//Adjusts a point to the graph.  Ie...if you give it a point that's greater than or less than
		//points in the graph, it will reset it to points within the graph.
		//This is easily accomplished using the range of the graphing scales.
		adjustToGraph: function(axis, point){
				var scale;
				switch(axis){
						case 'x': scale = this.xScale;
									break;
						case 'y': scale = this.yScale;
									break;
						//Return if axis is not x or y.
						default: return;
				}
				//scale.range() returns an array of two values.
				//The first is the low end of the range, while the second is the highest.
				var low = scale.range()[0];
				var high = scale.range()[1];
				//Return low or high is the value is outside their interval.  Otherwise, return point.
				if (point < low) return low;
				if (point > high) return high;
				return point;
		},
		
		//Given a series object, return the value that should be displayed
		getValueForDisplay: function(seriesObject) {
			var value = seriesObject.value;
			var units = "";
			//If metadata exists
			if(this.hasMetadata(seriesObject.name)) {
				var metadata = this.metadata[seriesObject.name];
				//And amplitude exists in metadata
				if ($defined(metadata.amplitude)){
					//Multiply the charting value by amplitude
					value = seriesObject.value.toFloat() * metadata['amplitude'];
				}
				if ($defined(metadata.units)){
					//Set units to the string
					units = metadata.units;
				}
			} else {
				//Format bytes properly and return
				if (this.options.yType == 'bytes') {
					return seriesObject.value.toInt().convertFileSize();
				}
			}
			return String(value.round(2)) + " " + units;
		},
		//Updates the display of the currently visible tip
		updatePointValue: function(seriesList) {
				if (seriesList.length > 0) {
					var tipList = new Element('div');
					seriesList.each(function(series) {
						var tipBlock = new Element('div', {'class': 'tip-series'});
						var tipColor = new Element('div', {'class': 'tip-series-color'});
						var tipText = new Element('div', {'class': 'tip-series-value'});
						var tipSeriesName = new Element('span', {'class': 'tip-series-name'});
						tipSeriesName.set('text', series.name);
						tipSeriesName.inject(tipBlock, 'top');
						tipColor.inject(tipBlock, 'top');
						tipColor.setStyle('background-color', this.getColor(series.name));
						tipText.set('text', this.getValueForDisplay(series));
						tipText.inject(tipBlock, 'bottom');
						tipBlock.inject(tipList, 'bottom');
					}.bind(this));
					this.tip.setTitle('');
					this.tip.setText(tipList);
					var tipElem = this.tip.toElement();
					if(!tipElem.getParent() || !document.body.hasChild(tipElem)) tipElem.dispose();
					this.tip.show(this.element, true);
				} else {
						this.tip.hide();
				}
		}, 

		//Returns highlighted data index
		getHighlightedIndex: function() {
				return this.highlighted_index;
		},

		//Sets higlighted data index
		setHighlightedIndex: function(index) {
				this.highlighted_index = index;
		},

		//Do any cleanup necessary of chart
		destroy: function() {
				if(this.tip) {
						 this.tip.toElement().destroy();
						 delete this.tip;
				}
		} 
});

Number.implement('shortString', function() {
	var numKsToAbbreviation = ['', 'k','m', 'b', 't'];
	var base = this;
	var numKs = 0;
	while (base > 1000) {
		base /= 1000;
		numKs++;
	}
	return base + numKsToAbbreviation[numKs];
});
})();

