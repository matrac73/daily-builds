import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTrackFile } from '../src/track-parser.js';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Meta</name></metadata>
  <trk><name><![CDATA[Morning Run &amp; Coffee]]></name><trkseg>
    <trkpt lat="48.8566" lon="2.3522"><ele>35.2</ele><time>2026-05-01T07:00:00Z</time></trkpt>
    <trkpt lon="2.3530" lat="48.8570"><ele>36</ele><time>2026-05-01T07:00:10Z</time></trkpt>
    <trkpt lat='48.8575' lon='2.3540'/>
    <trkpt lat="999" lon="2.35"><ele>1</ele></trkpt>
  </trkseg></trk>
</gpx>`;

test('parses GPX track points with attributes in any order', () => {
  const { name, points } = parseTrackFile(GPX);
  assert.equal(name, 'Morning Run & Coffee');
  assert.equal(points.length, 3, 'invalid latitude is skipped');
  assert.deepEqual(points[0], { lat: 48.8566, lon: 2.3522, ele: 35.2, time: Date.parse('2026-05-01T07:00:00Z') });
  assert.equal(points[1].lon, 2.353);
  assert.deepEqual(points[2], { lat: 48.8575, lon: 2.354, ele: null, time: null });
});

test('falls back to route points (Strava route export)', () => {
  const gpx = `<gpx><rte><name>Route</name>
    <rtept lat="45" lon="6"><ele>1000</ele></rtept><rtept lat="45.001" lon="6.001"></rtept></rte></gpx>`;
  const { name, points } = parseTrackFile(gpx);
  assert.equal(name, 'Route');
  assert.equal(points.length, 2);
  assert.equal(points[0].ele, 1000);
});

test('parses TCX trackpoints and ignores points without position', () => {
  const tcx = `<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-05-01T07:00:00Z</Id>
    <Lap><Track>
      <Trackpoint><Time>2026-05-01T07:00:00Z</Time><Position><LatitudeDegrees>45.1</LatitudeDegrees><LongitudeDegrees>5.7</LongitudeDegrees></Position><AltitudeMeters>210</AltitudeMeters></Trackpoint>
      <Trackpoint><Time>2026-05-01T07:00:05Z</Time><HeartRateBpm><Value>140</Value></HeartRateBpm></Trackpoint>
      <Trackpoint><Time>2026-05-01T07:00:10Z</Time><Position><LatitudeDegrees>45.101</LatitudeDegrees><LongitudeDegrees>5.701</LongitudeDegrees></Position></Trackpoint>
    </Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
  const { name, points } = parseTrackFile(tcx);
  assert.equal(name, '2026-05-01T07:00:00Z');
  assert.equal(points.length, 2);
  assert.equal(points[0].ele, 210);
  assert.equal(points[1].time, Date.parse('2026-05-01T07:00:10Z'));
});

test('rejects unknown formats and empty tracks', () => {
  assert.throws(() => parseTrackFile('{"type":"FeatureCollection"}'), /GPX ou TCX/);
  assert.throws(() => parseTrackFile('<gpx><trk></trk></gpx>'), /trace GPS/);
});

test('parses the bundled demo track', async () => {
  const xml = await readFile(new URL('../demo/chamonix-lac-blanc.gpx', import.meta.url), 'utf8');
  const { name, points } = parseTrackFile(xml);
  assert.match(name, /Lac Blanc/);
  assert.ok(points.length > 300);
  assert.ok(points.every((p) => p.ele != null && p.time != null));
});
