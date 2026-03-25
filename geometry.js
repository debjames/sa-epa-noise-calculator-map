/**
 * geometry.js — 2D ray-polygon intersection for building barrier screening.
 * Works in flat [lat, lng] space (short distances, no projection needed).
 */

/**
 * Does line segment (p1→p2) intersect segment (p3→p4)?
 * Returns intersection point {lat, lng} or null.
 * Each point is {lat, lng} or [lat, lng].
 */
export function segmentsIntersect(p1, p2, p3, p4) {
  var x1 = Array.isArray(p1) ? p1[1] : p1.lng;
  var y1 = Array.isArray(p1) ? p1[0] : p1.lat;
  var x2 = Array.isArray(p2) ? p2[1] : p2.lng;
  var y2 = Array.isArray(p2) ? p2[0] : p2.lat;
  var x3 = Array.isArray(p3) ? p3[1] : p3.lng;
  var y3 = Array.isArray(p3) ? p3[0] : p3.lat;
  var x4 = Array.isArray(p4) ? p4[1] : p4.lng;
  var y4 = Array.isArray(p4) ? p4[0] : p4.lat;

  var denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null; // parallel or coincident

  var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  var u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      lat: y1 + t * (y2 - y1),
      lng: x1 + t * (x2 - x1)
    };
  }
  return null;
}

/**
 * Returns all edges of a building polygon as segment pairs.
 * polygon is an array of [lat, lng] pairs.
 * Returns [[v0,v1], [v1,v2], ..., [vN,v0]]
 */
export function getBuildingEdges(polygon) {
  var edges = [];
  for (var i = 0; i < polygon.length; i++) {
    var j = (i + 1) % polygon.length;
    edges.push([polygon[i], polygon[j]]);
  }
  return edges;
}

/**
 * Flat-earth distance in metres between two {lat,lng} points.
 * Accurate enough for short distances (< 1 km).
 */
export function flatDistM(a, b) {
  var dLat = (b.lat - a.lat) * 111320;
  var dLng = (b.lng - a.lng) * 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Returns all building edges that intersect the ray from srcLL to recLL.
 * Each result: { building, edgeStart, edgeEnd, intersection, distFromSrc }
 */
export function getIntersectingEdges(srcLL, recLL, buildings) {
  var results = [];
  for (var bi = 0; bi < buildings.length; bi++) {
    var b = buildings[bi];
    var edges = getBuildingEdges(b.polygon);
    for (var ei = 0; ei < edges.length; ei++) {
      var edge = edges[ei];
      var p3 = { lat: edge[0][0], lng: edge[0][1] };
      var p4 = { lat: edge[1][0], lng: edge[1][1] };
      var hit = segmentsIntersect(srcLL, recLL, p3, p4);
      if (hit) {
        results.push({
          building: b,
          edgeStart: p3,
          edgeEnd: p4,
          intersection: hit,
          distFromSrc: flatDistM(srcLL, hit)
        });
      }
    }
  }
  return results;
}

/**
 * From all intersecting edges, find the dominant barrier —
 * the one nearest the midpoint of the source-receiver path.
 * Returns { building, edgeStart, edgeEnd, intersection,
 *           barrierHeightM, pathLengthDiff } or null.
 */
export function getDominantBarrier(srcLL, recLL, srcHeightM, recHeightM, buildings) {
  var edges = getIntersectingEdges(srcLL, recLL, buildings);
  if (edges.length === 0) return null;

  var dDirect = flatDistM(srcLL, recLL);
  var midDist = dDirect / 2;

  // Find edge nearest the midpoint
  var best = null;
  var bestMidDiff = Infinity;
  for (var i = 0; i < edges.length; i++) {
    var diff = Math.abs(edges[i].distFromSrc - midDist);
    if (diff < bestMidDiff) {
      bestMidDiff = diff;
      best = edges[i];
    }
  }

  var barrierH = (best.building.heightM != null) ? best.building.heightM : 3.0;
  var d1 = best.distFromSrc;
  var d2 = flatDistM(best.intersection, recLL);

  // Path length difference δ (Maekawa)
  var delta =
    Math.sqrt(d1 * d1 + (barrierH - srcHeightM) * (barrierH - srcHeightM)) +
    Math.sqrt(d2 * d2 + (barrierH - recHeightM) * (barrierH - recHeightM)) -
    dDirect;

  return {
    building: best.building,
    edgeStart: best.edgeStart,
    edgeEnd: best.edgeEnd,
    intersection: best.intersection,
    barrierHeightM: barrierH,
    pathLengthDiff: delta
  };
}
