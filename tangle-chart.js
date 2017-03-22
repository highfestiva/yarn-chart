// Draws a horizontal line chart, using yarn texture, and displaying high magnitudes (>=100) with yarn tangles.
// Requires yarn-chart.js.
// Written 2017 by Jonas Byström, highfestiva@gmail.com.
// Open source, use as you like.

"use strict";

yarnChart.createBallPoint = function(center, angle, xRadius, yRadius) {
	return center.add(new yarnChart.Vec(xRadius*Math.cos(angle), yRadius*Math.sin(angle)));
}

yarnChart.addTangle = function(x0, points, tanglePoints) {
	var x = 0;
	var h = 0;
	for (var i = 0, N = tanglePoints.length; i < N; ++i) {
		x += tanglePoints[i].x;
		h = tanglePoints[i].y > h? tanglePoints[i].y : h;
	}
	x /= tanglePoints.length;
	h /= 100;
	var center = new yarnChart.Vec(x, 0);

	var angle = 5.5;
	var xRadius = (tanglePoints[i-1].x - x0) / 4;
	var yRadius = h * 0.07;
	var laps = Math.ceil(tanglePoints.length/3) * Math.round(h);
	var dxr = xRadius / 5 / laps;
	var dyr = yRadius / 5 / laps;
	var xr = xRadius;
	var yr = yRadius;
	for (var j = 0, M = 3*laps; j < M; ++j) {
		points.push(yarnChart.createBallPoint(center, angle, xr, yr));
		angle += 2;
		xr -= dxr;
		yr -= dyr;
	}
	points.push(yarnChart.createBallPoint(center, angle, xr, yr));
}

yarnChart.generateTangles = function(yData, xData) {
	var points = [];
	var tanglePoints = [];
	for (var i = 0, N = yData.length; i < N; ++i) {
		if (yData[i] < 100) {
			if (tanglePoints.length) {
				var x0 = points.length? points[points.length-1].x : xData[0]*2-xData[1];
				yarnChart.addTangle(x0, points, tanglePoints);
				tanglePoints = [];
			}
			var center = new yarnChart.Vec(xData[i], 0);
			points.push(center);
		} else {
			var p = new yarnChart.Vec(xData[i], yData[i]);
			tanglePoints.push(p);
		}
	}
	if (tanglePoints.length) {
		var x0 = points.length? points[points.length-1].x : xData[0]*2-xData[1];
		yarnChart.addTangle(x0, points, tanglePoints);
	}
	var x = [];
	var y = []
	for (var i = 0, N = points.length; i < N; ++i) {
		x.push(points[i].x);
		y.push(points[i].y);
	}
	return [y, x];
}

yarnChart.tangleRender = function(canvas, yData, xData) {
	xData = yarnChart.generateXData(yData, xData);
	var key = canvas.getAttribute('yarnIndex');
	var gl = yarnChart.gls[key];
	var dy = (xData[1]-xData[0]) * 5 * canvas.height / canvas.width / gl.lineWidth;
	gl.yMin = -dy;
	gl.yMax = +dy;
	[yData, xData] = yarnChart.generateTangles(yData, xData);
	yarnChart.yarnRender(canvas, yData, xData);
}

yarnChart.initTangleChart = function(canvas, yData, xData, yarnName, lineWidth) {
	yarnChart.init(canvas, yData, xData, yarnName, lineWidth, yarnChart.tangleRender);
	return {
		update: function(y, x) {
			yarnChart.tangleRender(canvas, y, x);
		}
	};
}
