import * as _ from 'lodash';
import * as mocha from 'mocha';
import * as assert from 'assert';
import * as request from 'request';

import * as web from '../lib/index';
import { app, baseUrl } from './test-base';


const myNamespace = 'my-namespace';
const localBaseUrl = baseUrl + myNamespace + '/somectrl';

@web.controller('somectrl')
class NamespaceController extends web.BaseController {
	@web.get()
	test() { return { done: true }; }
}

let ctrl: NamespaceController;

describe('Namespace', () => {
	it('should be created and registered', () => {
		ctrl = new NamespaceController();
		ctrl.register(app, () => {}, myNamespace);
	});

	it('should work with namespace', (done) => {
		request(`${localBaseUrl}/test`, (err, res, body) => {
			let data = JSON.parse(body);
			assert(!err);
			assert.equal(res.statusCode, 200);
			assert.deepEqual(data, { done: true });
			done();
		});
	});
});