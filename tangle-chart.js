// Draws a horizontal line chart, using yarn texture, and displaying high magnitudes (>=100) with yarn tangles.
// Requires yarn-chart.js.
// Written 2017 by Jonas Byström, highfestiva@gmail.com.
// Open source, use as you like.

"use strict";

function createBallPoint(center, angle, radius) {
	return center.add(new Vec(radius*Math.cos(angle), radius*Math.sin(angle)));
}

function generateTangles(yData, xData) {
	var points = [];
	for (var i = 0, N = yData.length; i < N; ++i) {
		var center = new Vec(xData[i],0)
		if (yData[i] < 100) {
			points.push(center);
		} else {
			var angle = 5.4;
			var radius = (i? xData[i]-xData[i-1] : xData[i+1]-xData[i]) / 12;
			if (yData[i] >= 100) {
				var amp = yData[i] / 100;
				var r = radius * amp;
				var dr = radius / 9;
				for (var j = 0, M = 8*amp; j < M; ++j) {
					points.push(createBallPoint(center, angle, r));
					angle += 1.57;
					r -= dr;
				}
			}
			// Round off nicely with a last point.
			points.push(createBallPoint(center, angle, r));
		}
	}
	var x = [];
	var y = []
	for (var i = 0, N = points.length; i < N; ++i) {
		x.push(points[i].x);
		y.push(points[i].y);
	}
	return [y, x];
}

function tangleRender(canvas, yData, xData) {
	xData = generateXData(yData, xData);
	var key = canvas.getAttribute('yarnIndex');
	var dx = xData[1]-xData[0];
	gls[key].yMin = -dx;
	gls[key].yMax = +dx;
	[yData, xData] = generateTangles(yData, xData);
	yarnRender(canvas, yData, xData);
}

function tangleChart(canvas, yData, xData, yarnName, lineWidth) {
	yarnChart(canvas, yData, xData, yarnName, lineWidth, tangleRender);
}
