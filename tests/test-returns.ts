import * as _ from 'lodash';
import * as assert from 'assert';
import * as request from 'request';

import * as web from '../dist/index';
import { app, baseUrl } from './test-base';


var localBaseUrl = baseUrl + 'returns/';


@web.Controller('returns')
@web.Public()
class ReturnsTestController extends web.AdvancedController {
	@web.Get('get-promise')
	getPromise(
		@web.Query('value', Number) value: number
	) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				resolve({ value: value });
			}, 20);
		});
	}

	@web.Get('get-promise-rejected')
	getPromiseRejected(
		@web.Query('code', Number) code: number
	) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				reject({ statusCode: code});
			}, 20);
		});
	}

	@web.Get('failing-autoclosed')
	getFailingAutoClosed(@web.Res() res: web.Response) {
		throw new Error('Catch me!');
	}

	@web.Get('failing-autoclosed-async')
	async getFailingAutoClosedAsnyc(@web.Res() res: web.Response) {
		await new Promise((resolve, reject) =>
			setTimeout(() => reject(new Error('Catch me async!')), 100)
		);
	}

}


describe('ReturnsTestController', () => {
	let mainController: ReturnsTestController;
	let generalAssert = (err, res) => {
		assert(!err);
		assert.equal(res.statusCode, 200);
	};

	before(() => {
		mainController = new ReturnsTestController();
		mainController.register(app, { implicitAccess: true });
	});

	it('should return the promise value', (done) => {
		request(localBaseUrl + 'get-promise?value=99', (error, response, body) => {
			generalAssert(error, response);
			let data = JSON.parse(body);
			assert.equal(data.value, 99);
			done();
		});
	});

	it('should return rejected promise with error code', (done) => {
		request(localBaseUrl + 'get-promise-rejected?code=999', (error, response, body) => {
			assert.equal(response.statusCode, 999);
			done();
		});
	});

	it('should handle rejected autoClosed', done => {
		request(localBaseUrl + 'failing-autoclosed', (error, response, body) => {
			assert.equal(response.statusCode, 500);
			done();
		});
	});

	it('should handle rejected async autoClosed', done => {
		request(localBaseUrl + 'failing-autoclosed-async', (error, response, body) => {
			assert.equal(response.statusCode, 500);
			done();
		});
	});

});
