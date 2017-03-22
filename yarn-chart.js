// Draw line charts using a texture, for instance an image of a yarn.
// Written 2017 by Jonas Byström, highfestiva@gmail.com.
// Open source, use as you like.

"use strict";

var yarnChart = {};
yarnChart.canvasIndex = 0;
yarnChart.gls = {};


yarnChart.Vec = function(x, y) {
	this.x = x;
	this.y = y;
	this.add = function(v) {
		return new yarnChart.Vec(this.x+v.x, this.y+v.y);
	}
	this.sub = function(v) {
		return new yarnChart.Vec(this.x-v.x, this.y-v.y);
	}
	this.neg = function() {
		return new yarnChart.Vec(-this.x, -this.y);
	}
	this.dot = function(v) {
		return this.x*v.x + this.y*v.y;
	}
	this.cornerTangent = function(p0, p1) {
		var u = p0.sub(this);
		var v = p1.sub(this);
		return u.add(v).rot90Ccw();
	}
	this.projectOnto = function(v) {
		var mag = v.magnitude();
		if (mag <= 0) {
			mag = 1;
		}
		return v.mul(v.dot(this)/mag);
	}
	this.rot90Ccw = function() {
		return new yarnChart.Vec(-this.y, this.x);
	}
	this.mul = function(f) {
		return new yarnChart.Vec(this.x*f, this.y*f);
	}
	this.normalize = function(l) {
		var L = l / this.len();
		return new yarnChart.Vec(this.x*L, this.y*L);
	}
	this.len = function() {
		return Math.sqrt(this.x*this.x + this.y*this.y);
	}
	this.magnitude = function() {
		return this.x*this.x + this.y*this.y;
	}
}

yarnChart.generateXData = function(yData, xData) {
	if (xData == null) {
		xData = [];
		for (var i = 0, N = yData.length; i < N; i++) {
			xData.push(i);
		}
		return xData;
	}
	return xData.slice();
}

yarnChart.removeRedundant = function(xData, yData) {
	var sameValueCount = 0;
	var lastValue = -1;
	for (var i = 0, N = yData.length; i < N; i++) {
		if (yData[i] == lastValue) {
			sameValueCount += 1
		} else {
			if (sameValueCount > 6) {
				// Remove the middle values, since they are the same and just form a straight line anyway.
				xData.splice(i-sameValueCount+3, sameValueCount-6);
				yData.splice(i-sameValueCount+3, sameValueCount-6);
			}
			sameValueCount = 1;
			lastValue = yData[i];
		}
	}
	if (sameValueCount > 6) {
		// Remove the middle values, since they are the same and just form a straight line anyway.
		xData.splice(i-sameValueCount+3, sameValueCount-6);
		yData.splice(i-sameValueCount+3, sameValueCount-6);
	}
}

yarnChart.lerp = function(t, p0, p1) {
	return new yarnChart.Vec(p0.x+(p1.x-p0.x)*t, p0.y+(p1.y-p0.y)*t);
}

yarnChart.bezier = function(t, p0, p1, p2, p3) {
	var q0 = yarnChart.lerp(t, p0, p1);
	var q1 = yarnChart.lerp(t, p1, p2);
	var q2 = yarnChart.lerp(t, p2, p3);
	var r0 = yarnChart.lerp(t, q0, q1);
	var r1 = yarnChart.lerp(t, q1, q2);
	return yarnChart.lerp(t, r0, r1);
}

yarnChart.bezierNormal = function(t, p0, p1, p2, p3, l) {
	var s = (t>=0.0001)? t-0.0001 : t+0.0001;
	var p = yarnChart.bezier(t, p0, p1, p2, p3);
	var q = yarnChart.bezier(s, p0, p1, p2, p3);
	var tangent = (s>t)? q.sub(p) : p.sub(q);
	var normal = tangent.rot90Ccw().normalize(l);
	return [p, normal];
}

yarnChart.segmentToQuadSide = function(p, n, hwRatio) {
	return [p.x+n.x*hwRatio, p.y+n.y,
		p.x-n.x*hwRatio, p.y-n.y];
}

yarnChart.bezierCtrlToLineTextureQuads = function(controlPoints, lineWidth, hwRatio, textureXScaleFactor, accuracy) {
	var textureX = 0;
	var indexBase = 0;
	var i = 0, N = controlPoints.length, K = Math.round(10*accuracy);
	var [p,n] = yarnChart.bezierNormal(0, controlPoints[i+0], controlPoints[i+1], controlPoints[i+2], controlPoints[i+3], lineWidth);
	var quads = [];
	var textureQuads = [];
	var triangleIndices = [];
	var quadTriangleIndices = [2,3,1,2,1,0];
	for (; i < N-1; i += 3) {
		for (var k = 0; k < K; ++k) {
			// Positional coordinates.
			var [q,m] = yarnChart.bezierNormal(k/K, controlPoints[i+0], controlPoints[i+1], controlPoints[i+2], controlPoints[i+3], lineWidth);
			var l = q.sub(p).len();
			p = q; n = m;
			quads = quads.concat(yarnChart.segmentToQuadSide(p, n, hwRatio));
			// Texture coordinates.
			textureX += l * textureXScaleFactor;
			textureQuads = textureQuads.concat([
				textureX, 0.0,
				textureX, 1.0
				]);
			// Indices.
			for (var j = 0, M = quadTriangleIndices.length; j < M; ++j) {
				triangleIndices.push(quadTriangleIndices[j]+indexBase);
			}
			indexBase += 2;
		}
	}
	triangleIndices.splice(-quadTriangleIndices.length, quadTriangleIndices.length);
	return [quads, textureQuads, triangleIndices];
}

yarnChart.normalizeArray = function(v, min, max, scale) {
	if (min == null || max == null) {
		min = Math.min.apply(null, v);
		max = Math.max.apply(null, v);
	}
	if (max-min < 0.01) {
		max += 0.01;
		min -= 0.01;
	}
	var avg = (max + min) / 2;
	scale = scale!=null? scale : 1;
	var il = 2*scale / (max - min);
	for (var i = 0, N = v.length; i < N; ++i) {
		v[i] = (v[i]-avg) * il;
	}
}

yarnChart.toBezierControlPoints = function(xData, yData) {
	var data = [];
	for (var i = 0, N = xData.length; i < N; ++i) {
		data.push(new yarnChart.Vec(xData[i], yData[i]));
		if (i+1 < xData.length) {
			var p1 = data[data.length-1];
			var p2 = new yarnChart.Vec(xData[i+1], yData[i+1]);
			var p0 = i? data[data.length-1-3] : p1;
			var vp = p2.sub(p1).mul(0.7);
			var v1 = yarnChart.lerp(0.9, vp, vp.projectOnto(p1.cornerTangent(p0,p2)));
			data.push(p1.add(v1));
			var p3 = (i+2 < xData.length)? new yarnChart.Vec(xData[i+2], yData[i+2]) : p2;
			var v2 = yarnChart.lerp(0.9, vp, vp.projectOnto(p2.cornerTangent(p1,p3)));
			data.push(p2.sub(v2));
		}
	}
	return data;
}

yarnChart.initGraph = function(canvas, lineImage, lineWidth) {
	var key = canvas.getAttribute('yarnIndex');
	if (yarnChart.gls[key] == null) {
		key = ++yarnChart.canvasIndex;
		canvas.setAttribute('yarnIndex', key);
		canvas.width  = canvas.parentElement.clientWidth;
		canvas.height = canvas.parentElement.clientHeight;
		yarnChart.gls[key] = canvas.getContext('webgl');
	}
	var gl = yarnChart.gls[key];
	gl.yMin = null;
	gl.yMax = null;
	gl.accuracy = 1;
	gl.lineWidth = lineWidth;
	gl.lineTexture = lineImage;
	gl.canvasLineWidth = lineWidth * 1.35 * gl.lineTexture.height / gl.canvas.height;

	// Create, compile and link shaders.
	var vertCode =
		'attribute vec3 a_pos;' +
		'attribute vec2 a_tex;' +
		'varying vec2 v_tex;' +
		'void main(void) {' +
		'  gl_Position = vec4(a_pos, 1.0);' +
		'  v_tex = a_tex;' +
		'}';
	var vertShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertShader, vertCode);
	gl.compileShader(vertShader);
	var fragCode =
		'precision mediump float;' +
		'uniform sampler2D tex;' +
		'varying vec2 v_tex;' +
		'void main(void) {' +
		'  vec4 col = texture2D(tex, v_tex);' +
		'  gl_FragColor = vec4(col.r, col.g, col.b, col.a);' +
		'}';
	var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragShader, fragCode);
	gl.compileShader(fragShader);
	gl.shaderProgram = gl.createProgram();
	gl.attachShader(gl.shaderProgram, vertShader);
	gl.attachShader(gl.shaderProgram, fragShader);
	gl.linkProgram(gl.shaderProgram);
	gl.useProgram(gl.shaderProgram);

	// Setup texture and settings.
	gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.lineTexture);

	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	gl.enable(gl.BLEND);

	gl.vertexBuffer = gl.createBuffer();
	gl.textureBuffer = gl.createBuffer();
	gl.indexBuffer = gl.createBuffer();
}

yarnChart.yarnRender = function(canvas, yData, xData) {
	var key = canvas.getAttribute('yarnIndex');
	var gl = yarnChart.gls[key];
	xData = yarnChart.generateXData(yData, xData);
	yData = yData.slice();
	yarnChart.normalizeArray(xData);
	var min = gl.yMin;
	var max = gl.yMax;
	var scale = 1;
	if (min == null || max == null) {
		scale = 0.925;
	}
	yarnChart.normalizeArray(yData, min, max, scale);
	yarnChart.removeRedundant(xData, yData);

	var points = yarnChart.toBezierControlPoints(xData, yData);
	var canvasHWRatio = gl.canvas.height / gl.canvas.width;
	var textureXScaleFactor = 0.5 * gl.canvas.width / gl.lineTexture.width;
	var [quads, textureQuads, triangleIndices] = yarnChart.bezierCtrlToLineTextureQuads(points, gl.canvasLineWidth, canvasHWRatio, textureXScaleFactor, gl.accuracy);

	gl.bindBuffer(gl.ARRAY_BUFFER, gl.vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quads), gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.textureBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureQuads), gl.DYNAMIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangleIndices), gl.DYNAMIC_DRAW);

	// Connect shaders and bind buffers.
	var posLocation = gl.getAttribLocation(gl.shaderProgram, "a_pos");
	gl.enableVertexAttribArray(posLocation);
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.vertexBuffer);
	gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);
	var texLocation = gl.getAttribLocation(gl.shaderProgram, "a_tex");
	gl.enableVertexAttribArray(texLocation);
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.textureBuffer);
	gl.vertexAttribPointer(texLocation, 2, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.indexBuffer); 

	// Render the indices.
	gl.drawElements(gl.TRIANGLES, triangleIndices.length, gl.UNSIGNED_SHORT, 0);
};

yarnChart.loadImage = function(url, callback) {
	var lineTexture = new Image();
	try {
		if ((new URL(url)).origin !== window.location.origin) {
			lineTexture.crossOrigin = "";
		}
	} catch (e) {}
	lineTexture.src = url;
	lineTexture.onload = function() {
		callback(lineTexture);
	}
}

yarnChart.init = function(canvas, yData, xData, yarnName, lineWidth, render) {
	xData = yarnChart.generateXData(yData, xData);
	yarnName = yarnName != null? yarnName : 'yarn.png';
	lineWidth = lineWidth != null? lineWidth : 1.0;
	render = render != null? render : yarnChart.yarnRender;
	yarnChart.loadImage(yarnName, function(lineImage) {
		yarnChart.initGraph(canvas, lineImage, lineWidth);
		render(canvas, yData, xData);
	});
	return {
		update: function(y, x) {
			render(canvas, y, x);
		}
	};
}
