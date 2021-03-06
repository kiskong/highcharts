/**
 * (c) 2010-2017 Torstein Honsi
 *
 * License: www.highcharts.com/license
 */
'use strict';
import H from '../parts/Globals.js';
import '../parts/Utilities.js';
import '../parts/Chart.js';
var Chart = H.Chart,
	each = H.each,
	merge = H.merge,
	perspective = H.perspective,
	pick = H.pick,
	wrap = H.wrap;

/*** 
	EXTENSION FOR 3D CHARTS
***/
// Shorthand to check the is3d flag
Chart.prototype.is3d = function () {
	return this.options.chart.options3d && this.options.chart.options3d.enabled; // #4280
};

Chart.prototype.propsRequireDirtyBox.push('chart.options3d');
Chart.prototype.propsRequireUpdateSeries.push('chart.options3d');

/**
 * Calculate scale of the 3D view. That is required to
 * fit chart's 3D projection into the actual plotting area. Reported as #4933.
 * @notice This function should ideally take the plot values instead of a chart object, 
 *         but since the chart object is needed for perspective it is not practical. 
 *         Possible to make both getScale and perspective more logical and also immutable.
 * @param  {Object} chart Chart object
 * @param  {Number} chart.plotLeft
 * @param  {Number} chart.plotWidth
 * @param  {Number} chart.plotTop
 * @param  {Number} chart.plotHeight
 * @param  {Number} depth The depth of the chart
 * @return {Number} The scale to fit the 3D chart into the plotting area.
 */
function getScale(chart, depth) {
	var plotLeft = chart.plotLeft,
		plotRight = chart.plotWidth + plotLeft,
		plotTop = chart.plotTop,
		plotBottom = chart.plotHeight + plotTop,
		originX = plotLeft + chart.plotWidth / 2,
		originY = plotTop + chart.plotHeight / 2,
		bbox3d = {
			minX: Number.MAX_VALUE,
			maxX: -Number.MAX_VALUE,
			minY: Number.MAX_VALUE,
			maxY: -Number.MAX_VALUE
		},
		corners,
		scale = 1;

	// Top left corners:
	corners = [{
		x: plotLeft,
		y: plotTop,
		z: 0
	}, {
		x: plotLeft,
		y: plotTop,
		z: depth
	}];

	// Top right corners:
	each([0, 1], function (i) { 
		corners.push({
			x: plotRight,
			y: corners[i].y,
			z: corners[i].z
		});
	});

	// All bottom corners:
	each([0, 1, 2, 3], function (i) {
		corners.push({
			x: corners[i].x,
			y: plotBottom,
			z: corners[i].z
		});
	});

	// Calculate 3D corners:
	corners = perspective(corners, chart, false);

	// Get bounding box of 3D element:
	each(corners, function (corner) {
		bbox3d.minX = Math.min(bbox3d.minX, corner.x);
		bbox3d.maxX = Math.max(bbox3d.maxX, corner.x);
		bbox3d.minY = Math.min(bbox3d.minY, corner.y);
		bbox3d.maxY = Math.max(bbox3d.maxY, corner.y);
	});

	// Left edge:
	if (plotLeft > bbox3d.minX) {
		scale = Math.min(scale, 1 - Math.abs((plotLeft + originX) / (bbox3d.minX + originX)) % 1);
	}

	// Right edge:
	if (plotRight < bbox3d.maxX) {
		scale = Math.min(scale, (plotRight - originX) / (bbox3d.maxX - originX));
	}

	// Top edge:
	if (plotTop > bbox3d.minY) {
		if (bbox3d.minY < 0) {
			scale = Math.min(scale, (plotTop + originY) / (-bbox3d.minY + plotTop + originY));
		} else {
			scale = Math.min(scale, 1 - (plotTop + originY) / (bbox3d.minY + originY) % 1);
		}
	}

	// Bottom edge:
	if (plotBottom < bbox3d.maxY) {
		scale = Math.min(scale, Math.abs((plotBottom - originY) / (bbox3d.maxY - originY)));
	}

	return scale;
}



H.wrap(H.Chart.prototype, 'isInsidePlot', function (proceed) {
	return this.is3d() || proceed.apply(this, [].slice.call(arguments, 1));
});

var defaultOptions = H.getOptions();
merge(true, defaultOptions, {
	chart: {
		options3d: {
			enabled: false,
			alpha: 0,
			beta: 0,
			depth: 100,
			fitToPlot: true,
			viewDistance: 25,
			axisLabelPosition: 'default',
			frame: {
				visible: 'default',
				size: 1,
				bottom: {},
				top: {},
				left: {},
				right: {},
				back: {},
				front: {}
			}
		}
	}
});

/*= if (!build.classic) { =*/
/**
 * Override the getContainer by adding the required CSS classes for column 
 * sides (#6018)
 */
wrap(Chart.prototype, 'getContainer', function (proceed) {
	proceed.apply(this, [].slice.call(arguments, 1));

	this.renderer.definition({
		tagName: 'style',
		textContent: 
			'.highcharts-3d-top{' +
				'filter: url(#highcharts-brighter)' +
			'}\n' +
			'.highcharts-3d-side{' +
				'filter: url(#highcharts-darker)' +
			'}\n'
	});
});
/*= } =*/

wrap(Chart.prototype, 'setClassName', function (proceed) {
	proceed.apply(this, [].slice.call(arguments, 1));

	if (this.is3d()) {
		this.container.className += ' highcharts-3d-chart';
	}
});

H.wrap(H.Chart.prototype, 'setChartSize', function (proceed) {
	var chart = this,
		options3d = chart.options.chart.options3d;

	proceed.apply(chart, [].slice.call(arguments, 1));

	if (chart.is3d()) {
		var inverted = chart.inverted,
			clipBox = chart.clipBox,
			margin = chart.margin,
			x = inverted ? 'y' : 'x',
			y = inverted ? 'x' : 'y',
			w = inverted ? 'height' : 'width',
			h = inverted ? 'width' : 'height';

		clipBox[x] = -(margin[3] || 0);
		clipBox[y] = -(margin[0] || 0);
		clipBox[w] = chart.chartWidth + (margin[3] || 0) + (margin[1] || 0);
		clipBox[h] = chart.chartHeight + (margin[0] || 0) + (margin[2] || 0);

		// Set scale, used later in perspective method():
		chart.scale3d = 1; // @notice getScale uses perspective, so scale3d has to be reset.
		if (options3d.fitToPlot === true) {
			chart.scale3d = getScale(chart, options3d.depth);
		}
	}
});

wrap(Chart.prototype, 'redraw', function (proceed) {
	if (this.is3d()) {
		// Set to force a redraw of all elements
		this.isDirtyBox = true;
		this.frame3d = this.get3dFrame();
	}
	proceed.apply(this, [].slice.call(arguments, 1));
});

wrap(Chart.prototype, 'render', function (proceed) {
	if (this.is3d()) {
		this.frame3d = this.get3dFrame();
	}
	proceed.apply(this, [].slice.call(arguments, 1));
});

// Draw the series in the reverse order (#3803, #3917)
wrap(Chart.prototype, 'renderSeries', function (proceed) {
	var series,
		i = this.series.length;

	if (this.is3d()) {
		while (i--) {
			series = this.series[i];
			series.translate();
			series.render();
		}
	} else {
		proceed.call(this);
	}
});

wrap(Chart.prototype, 'drawChartBox', function (proceed) {
	if (this.is3d()) {
		var chart = this,
			renderer = chart.renderer,
			options3d = this.options.chart.options3d,
			frame = chart.get3dFrame(),
			xm = this.plotLeft,
			xp = this.plotLeft + this.plotWidth,
			ym = this.plotTop,
			yp = this.plotTop + this.plotHeight,
			zm = 0,
			zp = options3d.depth,
			xmm = xm - (frame.left.visible ? frame.left.size : 0),
			xpp = xp + (frame.right.visible ? frame.right.size : 0),
			ymm = ym - (frame.top.visible ? frame.top.size : 0),
			ypp = yp + (frame.bottom.visible ? frame.bottom.size : 0),
			zmm = zm - (frame.front.visible ? frame.front.size : 0),
			zpp = zp + (frame.back.visible ? frame.back.size : 0),
			verb = chart.hasRendered ? 'animate' : 'attr';

		this.frame3d = frame;

		if (!this.frameShapes) {
			this.frameShapes = {
				bottom: renderer.polyhedron().add(),
				top: renderer.polyhedron().add(),
				left: renderer.polyhedron().add(),
				right: renderer.polyhedron().add(),
				back: renderer.polyhedron().add(),
				front: renderer.polyhedron().add()
			};
		}

		this.frameShapes.bottom[verb]({
			'class': 'highcharts-3d-frame highcharts-3d-frame-bottom',
			zIndex: frame.bottom.frontFacing ? -1000 : 1000,
			faces: [
				{ //bottom
					fill: H.color(frame.bottom.color).brighten(0.1).get(),
					vertexes: [{ x: xmm, y: ypp, z: zmm }, { x: xpp, y: ypp, z: zmm }, { x: xpp, y: ypp, z: zpp }, { x: xmm, y: ypp, z: zpp }],
					enabled: frame.bottom.visible
				},
				{ //top
					fill: H.color(frame.bottom.color).brighten(0.1).get(),
					vertexes: [{ x: xm, y: yp, z: zp }, { x: xp, y: yp, z: zp }, { x: xp, y: yp, z: zm }, { x: xm, y: yp, z: zm }],
					enabled: frame.bottom.visible
				},
				{ //left
					fill: H.color(frame.bottom.color).brighten(-0.1).get(),
					vertexes: [{ x: xmm, y: ypp, z: zmm }, { x: xmm, y: ypp, z: zpp }, { x: xm, y: yp, z: zp }, { x: xm, y: yp, z: zm }],
					enabled: frame.bottom.visible && !frame.left.visible
				},
				{ //right
					fill: H.color(frame.bottom.color).brighten(-0.1).get(),
					vertexes: [{ x: xpp, y: ypp, z: zpp }, { x: xpp, y: ypp, z: zmm }, { x: xp, y: yp, z: zm }, { x: xp, y: yp, z: zp }],
					enabled: frame.bottom.visible && !frame.right.visible
				},
				{ //front
					fill: H.color(frame.bottom.color).get(),
					vertexes: [{ x: xpp, y: ypp, z: zmm }, { x: xmm, y: ypp, z: zmm }, { x: xm, y: yp, z: zm }, { x: xp, y: yp, z: zm }],
					enabled: frame.bottom.visible && !frame.front.visible
				},
				{ //back
					fill: H.color(frame.bottom.color).get(),
					vertexes: [{ x: xmm, y: ypp, z: zpp }, { x: xpp, y: ypp, z: zpp }, { x: xp, y: yp, z: zp }, { x: xm, y: yp, z: zp }],
					enabled: frame.bottom.visible && !frame.back.visible
				}
			]
		});
		this.frameShapes.top[verb]({
			'class': 'highcharts-3d-frame highcharts-3d-frame-top',
			zIndex: frame.top.frontFacing ? -1000 : 1000,
			faces: [
				{ //bottom
					fill: H.color(frame.top.color).brighten(0.1).get(),
					vertexes: [{ x: xmm, y: ymm, z: zpp }, { x: xpp, y: ymm, z: zpp }, { x: xpp, y: ymm, z: zmm }, { x: xmm, y: ymm, z: zmm }],
					enabled: frame.top.visible
				},
				{ //top
					fill: H.color(frame.top.color).brighten(0.1).get(),
					vertexes: [{ x: xm, y: ym, z: zm }, { x: xp, y: ym, z: zm }, { x: xp, y: ym, z: zp }, { x: xm, y: ym, z: zp }],
					enabled: frame.top.visible
				},
				{ //left
					fill: H.color(frame.top.color).brighten(-0.1).get(),
					vertexes: [{ x: xmm, y: ymm, z: zpp }, { x: xmm, y: ymm, z: zmm }, { x: xm, y: ym, z: zm }, { x: xm, y: ym, z: zp }],
					enabled: frame.top.visible && !frame.left.visible
				},
				{ //right
					fill: H.color(frame.top.color).brighten(-0.1).get(),
					vertexes: [{ x: xpp, y: ymm, z: zmm }, { x: xpp, y: ymm, z: zpp }, { x: xp, y: ym, z: zp }, { x: xp, y: ym, z: zm }],
					enabled: frame.top.visible && !frame.right.visible
				},
				{ //front
					fill: H.color(frame.top.color).get(),
					vertexes: [{ x: xmm, y: ymm, z: zmm }, { x: xpp, y: ymm, z: zmm }, { x: xp, y: ym, z: zm }, { x: xm, y: ym, z: zm }],
					enabled: frame.top.visible && !frame.front.visible
				},
				{ //back
					fill: H.color(frame.top.color).get(),
					vertexes: [{ x: xpp, y: ymm, z: zpp }, { x: xmm, y: ymm, z: zpp }, { x: xm, y: ym, z: zp }, { x: xp, y: ym, z: zp }],
					enabled: frame.top.visible && !frame.back.visible
				}
			]
		});
		this.frameShapes.left[verb]({
			'class': 'highcharts-3d-frame highcharts-3d-frame-left',
			zIndex: frame.left.frontFacing ? -1000 : 1000,
			faces: [
				{ //bottom
					fill: H.color(frame.left.color).brighten(0.1).get(),
					vertexes: [{ x: xmm, y: ypp, z: zmm }, { x: xm, y: yp, z: zm }, { x: xm, y: yp, z: zp }, { x: xmm, y: ypp, z: zpp }],
					enabled: frame.left.visible && !frame.bottom.visible
				},
				{ //top
					fill: H.color(frame.left.color).brighten(0.1).get(),
					vertexes: [{ x: xmm, y: ymm, z: zpp }, { x: xm, y: ym, z: zp }, { x: xm, y: ym, z: zm }, { x: xmm, y: ymm, z: zmm }],
					enabled: frame.left.visible && !frame.top.visible
				},
				{ //left
					fill: H.color(frame.left.color).brighten(-0.1).get(),
					vertexes: [{ x: xmm, y: ypp, z: zpp }, { x: xmm, y: ymm, z: zpp }, { x: xmm, y: ymm, z: zmm }, { x: xmm, y: ypp, z: zmm }],
					enabled: frame.left.visible
				},
				{ //right
					fill: H.color(frame.left.color).brighten(-0.1).get(),
					vertexes: [{ x: xm, y: ym, z: zp }, { x: xm, y: yp, z: zp }, { x: xm, y: yp, z: zm }, { x: xm, y: ym, z: zm }],
					enabled: frame.left.visible
				},
				{ //front
					fill: H.color(frame.left.color).get(),
					vertexes: [{ x: xmm, y: ypp, z: zmm }, { x: xmm, y: ymm, z: zmm }, { x: xm, y: ym, z: zm }, { x: xm, y: yp, z: zm }],
					enabled: frame.left.visible && !frame.front.visible
				},
				{ //back
					fill: H.color(frame.left.color).get(),
					vertexes: [{ x: xmm, y: ymm, z: zpp }, { x: xmm, y: ypp, z: zpp }, { x: xm, y: yp, z: zp }, { x: xm, y: ym, z: zp }],
					enabled: frame.left.visible && !frame.back.visible
				}
			]
		});
		this.frameShapes.right[verb]({
			'class': 'highcharts-3d-frame highcharts-3d-frame-right',
			zIndex: frame.right.frontFacing ? -1000 : 1000,
			faces: [
				{ //bottom
					fill: H.color(frame.right.color).brighten(0.1).get(),
					vertexes: [{ x: xpp, y: ypp, z: zpp }, { x: xp, y: yp, z: zp }, { x: xp, y: yp, z: zm }, { x: xpp, y: ypp, z: zmm }],
					enabled: frame.right.visible && !frame.bottom.visible
				},
				{ //top
					fill: H.color(frame.right.color).brighten(0.1).get(),
					vertexes: [{ x: xpp, y: ymm, z: zmm }, { x: xp, y: ym, z: zm }, { x: xp, y: ym, z: zp }, { x: xpp, y: ymm, z: zpp }],
					enabled: frame.right.visible && !frame.top.visible
				},
				{ //left
					fill: H.color(frame.right.color).brighten(-0.1).get(),
					vertexes: [{ x: xp, y: ym, z: zm }, { x: xp, y: yp, z: zm }, { x: xp, y: yp, z: zp }, { x: xp, y: ym, z: zp }],
					enabled: frame.right.visible
				},
				{ //right
					fill: H.color(frame.right.color).brighten(-0.1).get(),
					vertexes: [{ x: xpp, y: ypp, z: zmm }, { x: xpp, y: ymm, z: zmm }, { x: xpp, y: ymm, z: zpp }, { x: xpp, y: ypp, z: zpp }],
					enabled: frame.right.visible
				},
				{ //front
					fill: H.color(frame.right.color).get(),
					vertexes: [{ x: xpp, y: ymm, z: zmm }, { x: xpp, y: ypp, z: zmm }, { x: xp, y: yp, z: zm }, { x: xp, y: ym, z: zm }],
					enabled: frame.right.visible && !frame.front.visible
				},
				{ //back
					fill: H.color(frame.right.color).get(),
					vertexes: [{ x: xpp, y: ypp, z: zpp }, { x: xpp, y: ymm, z: zpp }, { x: xp, y: ym, z: zp }, { x: xp, y: yp, z: zp }],
					enabled: frame.right.visible && !frame.back.visible
				}
			]
		});
		this.frameShapes.back[verb]({
			'class': 'highcharts-3d-frame highcharts-3d-frame-back',
			zIndex: frame.back.frontFacing ? -1000 : 1000,
			faces: [
				{ //bottom
					fill: H.color(frame.back.color).brighten(0.1).get(),
					vertexes: [{ x: xpp, y: ypp, z: zpp }, { x: xmm, y: ypp, z: zpp }, { x: xm, y: yp, z: zp }, { x: xp, y: yp, z: zp }],
					enabled: frame.back.visible && !frame.bottom.visible
				},
				{ //top
					fill: H.color(frame.back.color).brighten(0.1).get(),
					vertexes: [{ x: xmm, y: ymm, z: zpp }, { x: xpp, y: ymm, z: zpp }, { x: xp, y: ym, z: zp }, { x: xm, y: ym, z: zp }],
					enabled: frame.back.visible && !frame.top.visible
				},
				{ //left
					fill: H.color(frame.back.color).brighten(-0.1).get(),
					vertexes: [{ x: xmm, y: ypp, z: zpp }, { x: xmm, y: ymm, z: zpp }, { x: xm, y: ym, z: zp }, { x: xm, y: yp, z: zp }],
					enabled: frame.back.visible && !frame.left.visible
				},
				{ //right
					fill: H.color(frame.back.color).brighten(-0.1).get(),
					vertexes: [{ x: xpp, y: ymm, z: zpp }, { x: xpp, y: ypp, z: zpp }, { x: xp, y: yp, z: zp }, { x: xp, y: ym, z: zp }],
					enabled: frame.back.visible && !frame.right.visible
				},
				{ //front
					fill: H.color(frame.back.color).get(),
					vertexes: [{ x: xm, y: ym, z: zp }, { x: xp, y: ym, z: zp }, { x: xp, y: yp, z: zp }, { x: xm, y: yp, z: zp }],
					enabled: frame.back.visible
				},
				{ //back
					fill: H.color(frame.back.color).get(),
					vertexes: [{ x: xmm, y: ypp, z: zpp }, { x: xpp, y: ypp, z: zpp }, { x: xpp, y: ymm, z: zpp }, { x: xmm, y: ymm, z: zpp }],
					enabled: frame.back.visible
				}
			]
		});
		this.frameShapes.front[verb]({
			'class': 'highcharts-3d-frame highcharts-3d-frame-front',
			zIndex: frame.front.frontFacing ? -1000 : 1000,
			faces: [
				{ //bottom
					fill: H.color(frame.front.color).brighten(0.1).get(),
					vertexes: [{ x: xmm, y: ypp, z: zmm }, { x: xpp, y: ypp, z: zmm }, { x: xp, y: yp, z: zm }, { x: xm, y: yp, z: zm }],
					enabled: frame.front.visible && !frame.bottom.visible
				},
				{ //top
					fill: H.color(frame.front.color).brighten(0.1).get(),
					vertexes: [{ x: xpp, y: ymm, z: zmm }, { x: xmm, y: ymm, z: zmm }, { x: xm, y: ym, z: zm }, { x: xp, y: ym, z: zm }],
					enabled: frame.front.visible && !frame.top.visible
				},
				{ //left
					fill: H.color(frame.front.color).brighten(-0.1).get(),
					vertexes: [{ x: xmm, y: ymm, z: zmm }, { x: xmm, y: ypp, z: zmm }, { x: xm, y: yp, z: zm }, { x: xm, y: ym, z: zm }],
					enabled: frame.front.visible && !frame.left.visible
				},
				{ //right
					fill: H.color(frame.front.color).brighten(-0.1).get(),
					vertexes: [{ x: xpp, y: ypp, z: zmm }, { x: xpp, y: ymm, z: zmm }, { x: xp, y: ym, z: zm }, { x: xp, y: yp, z: zm }],
					enabled: frame.front.visible && !frame.right.visible
				},
				{ //front
					fill: H.color(frame.front.color).get(),
					vertexes: [{ x: xp, y: ym, z: zm }, { x: xm, y: ym, z: zm }, { x: xm, y: yp, z: zm }, { x: xp, y: yp, z: zm }],
					enabled: frame.front.visible
				},
				{ //back
					fill: H.color(frame.front.color).get(),
					vertexes: [{ x: xpp, y: ypp, z: zmm }, { x: xmm, y: ypp, z: zmm }, { x: xmm, y: ymm, z: zmm }, { x: xpp, y: ymm, z: zmm }],
					enabled: frame.front.visible
				}
			]
		});
	}
	
	return proceed.apply(this, [].slice.call(arguments, 1));
});

Chart.prototype.retrieveStacks = function (stacking) {
	var series = this.series,
		stacks = {},
		stackNumber,
		i = 1;

	each(this.series, function (s) {
		stackNumber = pick(s.options.stack, (stacking ? 0 : series.length - 1 - s.index)); // #3841, #4532
		if (!stacks[stackNumber]) {
			stacks[stackNumber] = { series: [s], position: i };
			i++;
		} else {
			stacks[stackNumber].series.push(s);
		}
	});

	stacks.totalStacks = i + 1;
	return stacks;
};

Chart.prototype.get3dFrame = function () {
	var chart = this,
		options3d = chart.options.chart.options3d,
		frameOptions = options3d.frame,
		xm = chart.plotLeft,
		xp = chart.plotLeft + chart.plotWidth,
		ym = chart.plotTop,
		yp = chart.plotTop + chart.plotHeight,
		zm = 0,
		zp = options3d.depth,
		bottomOrientation = H.shapeArea3d([{ x: xm, y: yp, z: zp }, { x: xp, y: yp, z: zp }, { x: xp, y: yp, z: zm }, { x: xm, y: yp, z: zm }], chart),
		topOrientation    = H.shapeArea3d([{ x: xm, y: ym, z: zm }, { x: xp, y: ym, z: zm }, { x: xp, y: ym, z: zp }, { x: xm, y: ym, z: zp }], chart),
		leftOrientation   = H.shapeArea3d([{ x: xm, y: ym, z: zm }, { x: xm, y: ym, z: zp }, { x: xm, y: yp, z: zp }, { x: xm, y: yp, z: zm }], chart),
		rightOrientation  = H.shapeArea3d([{ x: xp, y: ym, z: zp }, { x: xp, y: ym, z: zm }, { x: xp, y: yp, z: zm }, { x: xp, y: yp, z: zp }], chart),
		frontOrientation  = H.shapeArea3d([{ x: xm, y: yp, z: zm }, { x: xp, y: yp, z: zm }, { x: xp, y: ym, z: zm }, { x: xm, y: ym, z: zm }], chart),
		backOrientation   = H.shapeArea3d([{ x: xm, y: ym, z: zp }, { x: xp, y: ym, z: zp }, { x: xp, y: yp, z: zp }, { x: xm, y: yp, z: zp }], chart),
		defaultShowBottom = false,
		defaultShowTop = false,
		defaultShowLeft = false,
		defaultShowRight = false,
		defaultShowFront = false,
		defaultShowBack = true;

	// The 'default' criteria to visible faces of the frame is looking up every
	// axis to decide whenever the left/right//top/bottom sides of the frame
	// will be shown
	each([].concat(chart.xAxis, chart.yAxis, chart.zAxis), function (axis) {
		if (axis) {
			if (axis.horiz) {
				if (axis.opposite) {
					defaultShowTop = true;
				} else {
					defaultShowBottom = true;
				}
			} else {
				if (axis.opposite) {
					defaultShowRight = true;
				} else {
					defaultShowLeft = true;
				}
			}
		}
	});

	var getFaceOptions = function (sources, faceOrientation, defaultVisible) {
		var faceAttrs = ['size', 'color', 'visible'];
		var options = {};
		for (var i = 0; i < faceAttrs.length; i++) {
			var attr = faceAttrs[i];
			for (var j = 0; j < sources.length; j++) {
				if (typeof sources[j] === 'object') {
					var val = sources[j][attr];
					if (val !== undefined && val !== null) {
						options[attr] = val;
						break;
					}
				}
			}
		}
		var isVisible = defaultVisible;
		if (options.visible === true || options.visible === false) {
			isVisible = options.visible;
		} else if (options.visible === 'auto') {
			isVisible = faceOrientation >= 0;
		}

		return {
			size: pick(options.size, 1),
			color: pick(options.color, 'none'),
			frontFacing: faceOrientation > 0,
			visible: isVisible
		};
	};

	// docs @TODO: Add all frame options (left, right, top, bottom, front, back) to
	// apioptions JSDoc once the new system is up.
	var ret = {
		// FIXME: Previously, left/right, top/bottom and front/back pairs shared
		// size and color.
		// For compatibility and consistency sake, when one face have
		// size/color/visibility set, the opposite face will default to the same
		// values. Also, left/right used to be called 'side', so that's also
		// added as a fallback
		bottom: getFaceOptions(
			[frameOptions.bottom, frameOptions.top, frameOptions],
			bottomOrientation,
			defaultShowBottom
		),
		top: getFaceOptions(
			[frameOptions.top, frameOptions.bottom, frameOptions],
			topOrientation,
			defaultShowTop
		),
		left: getFaceOptions(
			[
				frameOptions.left,
				frameOptions.right,
				frameOptions.side,
				frameOptions
			],
			leftOrientation,
			defaultShowLeft
		),
		right: getFaceOptions(
			[
				frameOptions.right,
				frameOptions.left,
				frameOptions.side,
				frameOptions
			],
			rightOrientation,
			defaultShowRight
		),
		back: getFaceOptions(
			[frameOptions.back, frameOptions.front, frameOptions],
			backOrientation,
			defaultShowBack
		),
		front: getFaceOptions(
			[frameOptions.front, frameOptions.back, frameOptions],
			frontOrientation,
			defaultShowFront
		)
	};


	// Decide the bast place to put axis title/labels based on the visible faces.
	// Ideally, The labels can only be on the edge between a visible face and an invisble one.
	// Also, the Y label should be one the left-most edge (right-most if opposite),
	if (options3d.axisLabelPosition === 'auto') {
		var isValidEdge = function (face1, face2) {
			return (face1.visible !== face2.visible) ||
				(face1.visible && face2.visible && (face1.frontFacing !== face2.frontFacing));
		};

		var yEdges = [];
		if (isValidEdge(ret.left, ret.front)) {
			yEdges.push({ y: (ym + yp) / 2, x: xm, z: zm });
		}
		if (isValidEdge(ret.left, ret.back)) {
			yEdges.push({ y: (ym + yp) / 2, x: xm, z: zp });
		}
		if (isValidEdge(ret.right, ret.front)) {
			yEdges.push({ y: (ym + yp) / 2, x: xp, z: zm });
		}
		if (isValidEdge(ret.right, ret.back)) {
			yEdges.push({ y: (ym + yp) / 2, x: xp, z: zp });
		}

		var xBottomEdges = [];
		if (isValidEdge(ret.bottom, ret.front)) {
			xBottomEdges.push({ x: (xm + xp) / 2, y: yp, z: zm });
		}
		if (isValidEdge(ret.bottom, ret.back)) {
			xBottomEdges.push({ x: (xm + xp) / 2, y: yp, z: zp });
		}

		var xTopEdges = [];
		if (isValidEdge(ret.top, ret.front)) {
			xTopEdges.push({ x: (xm + xp) / 2, y: ym, z: zm });
		}
		if (isValidEdge(ret.top, ret.back)) {
			xTopEdges.push({ x: (xm + xp) / 2, y: ym, z: zp });
		}

		var zBottomEdges = [];
		if (isValidEdge(ret.bottom, ret.left)) {
			zBottomEdges.push({ z: (zm + zp) / 2, y: yp, x: xm });
		}
		if (isValidEdge(ret.bottom, ret.right)) {
			zBottomEdges.push({ z: (zm + zp) / 2, y: yp, x: xp });
		}

		var zTopEdges = [];
		if (isValidEdge(ret.top, ret.left)) {
			zTopEdges.push({ z: (zm + zp) / 2, y: ym, x: xm });
		}
		if (isValidEdge(ret.top, ret.right)) {
			zTopEdges.push({ z: (zm + zp) / 2, y: ym, x: xp });
		}

		var pickEdge = function (edges, axis, mult) {
			if (edges.length === 0) {
				return null;
			} else if (edges.length === 1) {
				return edges[0];
			}
			var best = 0,
				projections = perspective(edges, chart, false);
			for (var i = 1; i < projections.length; i++) {
				if (mult * projections[i][axis] > mult * projections[best][axis]) {
					best = i;
				} else if ((mult * projections[i][axis] === mult * projections[best][axis]) && (projections[i].z < projections[best].z)) {
					best = i;
				}
			}
			return edges[best];
		};
		ret.axes = {
			y: {
				'left': pickEdge(yEdges, 'x', -1),
				'right': pickEdge(yEdges, 'x', +1)
			},
			x: {
				'top': pickEdge(xTopEdges, 'y', -1),
				'bottom': pickEdge(xBottomEdges, 'y', +1)
			},
			z: {
				'top': pickEdge(zTopEdges, 'y', -1),
				'bottom': pickEdge(zBottomEdges, 'y', +1)
			}
		};
	} else {
		ret.axes = {
			y: {
				'left': { x: xm, z: zm },
				'right': { x: xp, z: zm }
			},
			x: {
				'top': { y: ym, z: zm },
				'bottom': { y: yp, z: zm }
			},
			z: {
				'top': { x: defaultShowLeft ? xp : xm, y: ym },
				'bottom': { x: defaultShowLeft ? xp : xm, y: yp }
			}
		};
	}

	return ret;
};

