import test from 'node:test';
import assert from 'node:assert/strict';
import { editContour } from '../apps/smart-home/src/app/editor/contour-edit.js';
import { validate, signedArea, dist } from '../apps/smart-home/src/app/editor/geometry.js';
const shape = [{x:0,y:0},{x:10000,y:0},{x:10000,y:8000},{x:0,y:8000}];
test('vertex editing changes only the selected vertex and leaves original untouched',()=>{
 const before=structuredClone(shape),ps=editContour(shape,'vertex',3,shape[3],{x:-2000,y:10000});
 assert.deepEqual(shape,before);assert.deepEqual(ps.slice(0,3),shape.slice(0,3));assert.deepEqual(ps[3],{x:-2000,y:10000});assert.equal(validate(ps),null);
});
test('edge translation moves its two endpoints identically, retaining direction and length',()=>{
 const ps=editContour(shape,'edge',2,{x:4000,y:8000},{x:4000,y:10000});
 assert.deepEqual(ps,[shape[0],shape[1],{x:10000,y:10000},{x:0,y:10000}]);assert.equal(dist(ps[2],ps[3]),10000);assert.equal(Math.abs(signedArea(ps)),100000000);
});
test('last edge wraps to first vertex',()=>{const ps=editContour(shape,'edge',3,{x:0,y:4000},{x:-1000,y:4000});assert.deepEqual(ps[0],{x:-1000,y:0});assert.deepEqual(ps[3],{x:-1000,y:8000});assert.deepEqual(ps[1],shape[1]);});
test('inserted vertex splits edge in its original order without premature source mutation',()=>{const ps=editContour(shape,'insert',2,{x:5000,y:8000},{x:5000,y:10000});assert.equal(shape.length,4);assert.equal(ps.length,5);assert.deepEqual(ps[3],{x:5000,y:10000});assert.deepEqual(ps[4],shape[3]);assert.equal(validate(ps),null);});
test('a concave arbitrary polygon uses the same editing algorithm',()=>{const l=[{x:0,y:0},{x:8000,y:0},{x:8000,y:3000},{x:4000,y:3000},{x:4000,y:8000},{x:0,y:8000}];assert.equal(validate(editContour(l,'vertex',3,l[3],{x:3000,y:4000})),null);});
test('crossing draft is detected by the common validator',()=>assert.ok(validate(editContour(shape,'vertex',3,shape[3],{x:15000,y:4000}))));
test('invalid indices, kinds and nonfinite input fail before mutation',()=>{for(const args of [['vertex',-1,shape[0],shape[1]],['invalid',0,shape[0],shape[1]],['edge',1,shape[0],{x:Infinity,y:0}]])assert.throws(()=>editContour(shape,...args));});
