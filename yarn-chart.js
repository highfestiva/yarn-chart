// Draw line charts using a texture, for instance an image of a yarn.
// Written 2017 by Jonas Byström, highfestiva@gmail.com.
// Open source, use as you like.

"use strict";

var canvasIndex = 0;
var gls = {};
var shaderPrograms = {};
var lineTextures = {};
var canvasLineWidths = {};

function Vec(x, y) {
	this.x = x;
	this.y = y;
	this.add = function(v) {
		return new Vec(this.x+v.x, this.y+v.y);
	}
	this.sub = function(v) {
		return new Vec(this.x-v.x, this.y-v.y);
	}
	this.neg = function() {
		return new Vec(-this.x, -this.y);
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
		return v.mul(v.dot(this)/v.magnitude());
	}
	this.rot90Ccw = function() {
		return new Vec(-this.y, this.x);
	}
	this.mul = function(f) {
		return new Vec(this.x*f, this.y*f);
	}
	this.normalize = function(l) {
		var L = l / this.len();
		return new Vec(this.x*L, this.y*L);
	}
	this.len = function() {
		return Math.sqrt(this.x*this.x + this.y*this.y);
	}
	this.magnitude = function() {
		return this.x*this.x + this.y*this.y;
	}
}

function generateXData(yData, xData) {
	if (xData == null) {
		xData = [];
		for (var i = 0, N = yData.length; i < N; i++) {
			xData.push(i);
		}
		return xData;
	}
	return xData.slice();
}

function removeRedundant(xData, yData) {
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

function lerp(t, p0, p1) {
	return new Vec(p0.x+(p1.x-p0.x)*t, p0.y+(p1.y-p0.y)*t);
}

function bezier(t, p0, p1, p2, p3) {
	var q0 = lerp(t, p0, p1);
	var q1 = lerp(t, p1, p2);
	var q2 = lerp(t, p2, p3);
	var r0 = lerp(t, q0, q1);
	var r1 = lerp(t, q1, q2);
	return lerp(t, r0, r1);
}

function bezierNormal(t, p0, p1, p2, p3) {
	var p = bezier(t, p0, p1, p2, p3);
	var p1 = bezier(t+0.001, p0, p1, p2, p3);
	var tangent = p1.sub(p);
	var normal = tangent.rot90Ccw().normalize(1);
	return [p, normal];
}

function segmentToQuadSide(p, n, lineWidth, hwRatio) {
	return [p.x+n.x*lineWidth*hwRatio, p.y+n.y*lineWidth,
		p.x-n.x*lineWidth*hwRatio, p.y-n.y*lineWidth];
}

function bezierCtrlToLineTextureQuads(controlPoints, lineWidth, hwRatio, textureXScaleFactor) {
	var textureX = 0;
	var indexBase = 0;
	var i = 0, N = controlPoints.length;
	var [p,n] = bezierNormal(0, controlPoints[i+0], controlPoints[i+1], controlPoints[i+2], controlPoints[i+3]);
	var quads = segmentToQuadSide(p, n, lineWidth, hwRatio);
	var textureQuads = [
		0.0, 0.0,
		0.0, 1.0,
	];
	var triangleIndices = [];
	var quadTriangleIndices = [2,3,1,2,1,0];
	for (i = 0; i < N-1; i += 3) {
		for (var k = 1; k <= 10; ++k) {
			// Positional coordinates.
			var [q,m] = bezierNormal(k/10, controlPoints[i+0], controlPoints[i+1], controlPoints[i+2], controlPoints[i+3]);
			var l = q.sub(p).len();
			p = q; n = m;
			quads = quads.concat(segmentToQuadSide(p, n, lineWidth, hwRatio));
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
	return [quads, textureQuads, triangleIndices];
}

function normalizeArray(v, scale) {
	scale = scale != null? scale : 1;
	var min = Math.min.apply(null, v);
	var max = Math.max.apply(null, v);
	if (max-min < 0.01) {
		max += 0.01;
		min -= 0.01;
	}
	var avg = (min+max) / 2;
	var il = 1.85 / (max - min);
	for (var i = 0, N = v.length; i < N; ++i) {
		v[i] = (v[i]-avg) * il * scale;
	}
}

function toBezierControlPoints(xData, yData) {
	var data = [];
	for (var i = 0, N = xData.length; i < N; ++i) {
		data.push(new Vec(xData[i], yData[i]));
		if (i+1 < xData.length) {
			var p1 = data[data.length-1];
			var p2 = new Vec(xData[i+1], yData[i+1]);
			var p0 = i? data[data.length-1-3] : p1;
			var vp = p2.sub(p1).mul(0.7);
			var v1 = lerp(0.9, vp, vp.projectOnto(p1.cornerTangent(p0,p2)));
			data.push(p1.add(v1));
			var p3 = (i+2 < xData.length)? new Vec(xData[i+2], yData[i+2]) : p2;
			var v2 = lerp(0.9, vp, vp.projectOnto(p2.cornerTangent(p1,p3)));
			data.push(p2.sub(v2));
		}
	}
	return data;
}

function initGraph(canvas, lineImage, lineWidth) {
	var key = canvas.getAttribute('yarnIndex');
	if (gls[key] == null) {
		key = ++canvasIndex;
		canvas.setAttribute('yarnIndex', key);
		canvas.width  = canvas.parentElement.clientWidth;
		canvas.height = canvas.parentElement.clientHeight;
		gls[key] = canvas.getContext('webgl');
	}
	var gl = gls[key];
	gl.yScale = 1;
	lineTextures[key] = lineImage;
	canvasLineWidths[key] = lineWidth * 1.35 * lineTextures[key].height / gl.canvas.height;

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
	shaderPrograms[key] = gl.createProgram();
	gl.attachShader(shaderPrograms[key], vertShader);
	gl.attachShader(shaderPrograms[key], fragShader);
	gl.linkProgram(shaderPrograms[key]);
	gl.useProgram(shaderPrograms[key]);

	// Setup texture and settings.
	gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lineTextures[key]);

	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	gl.enable(gl.BLEND);
}

function yarnRender(canvas, yData, xData) {
	var key = canvas.getAttribute('yarnIndex');
	var gl = gls[key];
	xData = generateXData(yData, xData);
	yData = yData.slice();
	normalizeArray(xData);
	normalizeArray(yData, gl.yScale);
	removeRedundant(xData, yData);

	var points = toBezierControlPoints(xData, yData);
	var canvasHWRatio = gl.canvas.height / gl.canvas.width;
	var textureXScaleFactor = 0.5 * gl.canvas.width / lineTextures[key].width;
	var [quads, textureQuads, triangleIndices] = bezierCtrlToLineTextureQuads(points, canvasLineWidths[key], canvasHWRatio, textureXScaleFactor);

	var vertexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quads), gl.STATIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	var textureBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureQuads), gl.STATIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	var indexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangleIndices), gl.STATIC_DRAW);

	// Connect shaders and bind buffers.
	var posLocation = gl.getAttribLocation(shaderPrograms[key], "a_pos");
	gl.enableVertexAttribArray(posLocation);
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);
	var texLocation = gl.getAttribLocation(shaderPrograms[key], "a_tex");
	gl.enableVertexAttribArray(texLocation);
	gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
	gl.vertexAttribPointer(texLocation, 2, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); 

	// Render the indices.
	gl.drawElements(gl.TRIANGLES, triangleIndices.length, gl.UNSIGNED_SHORT, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.deleteBuffer(vertexBuffer);
	gl.deleteBuffer(textureBuffer);
	gl.deleteBuffer(indexBuffer);
};

function loadImage(url, callback) {
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

function yarnChart(canvas, yData, xData, yarnName, lineWidth, render) {
	xData = generateXData(yData, xData);
	yarnName = yarnName != null? yarnName : 'yarn.png';
	lineWidth = lineWidth != null? lineWidth : 1.0;
	render = render != null? render : yarnRender;
	loadImage(yarnName, function(lineImage) {
		initGraph(canvas, lineImage, lineWidth);
		render(canvas, yData, xData);
	});
}
