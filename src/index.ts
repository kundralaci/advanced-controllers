import * as express from 'express';
import * as _ from 'lodash';

//------------------------------------------------------------------------------
// Types

export type Req = express.Request;
export type Res = express.Response;
declare var exports;
declare var Promise;

interface HttpAction {
	method: string;
	url: string;
	params: {
		index: number,
		from: string,
		name: string | symbol,
		type: any
		opt?: boolean
	}[];
	middlewares: ((req: Req, res: Res, next: Function) => void)[];
}

interface HttpActionProperty {
	(req: Req, res: Res): any;
	action: HttpAction;
}

//------------------------------------------------------------------------------
// Declaring routes

export function controller(controllerName: string) {
	if (controllerName[0] !== '/')
		controllerName = '/' + controllerName;

	return (target: any) => {
		target.__controller = { name: controllerName };
	};
}

function getHttpAction(prop: any): HttpAction {
	if (_.isFunction(prop) && prop.action) {
		return prop.action;
	}
	return null;
}

function setHttpAction(prop: HttpActionProperty, method: string, url: string) {
	if (url[0] !== '/')
		url = '/' + url;

	prop.action = prop.action || <any>{};
	prop.action.url = url;
	prop.action.method = method;
	prop.action.params = prop.action.params || [];
	prop.action.middlewares = prop.action.middlewares || [];
}

function routeDeclaration(method: string, name?: string) {
	return (target: any, key?: string, value?: PropertyDescriptor) => {
		setHttpAction(target[key], method, name || key);
	};
}

export function get(name?: string) { return routeDeclaration('GET', name); }
export function post(name?: string) { return routeDeclaration('POST', name); }
export function put(name?: string) { return routeDeclaration('PUT', name); }
export function head(name?: string) { return routeDeclaration('HEAD', name); }
export function options(name?: string) { return routeDeclaration('OPTIONS', name); }
export function del(name?: string) { return routeDeclaration('DELETE', name); }

function addMiddleware(prop: HttpActionProperty, mwFunc: (req: Req, res: Res, next: Function) => void) {
	prop.action = prop.action || {
		url: null,
		method: null,
		params: [],
		middlewares: [],
	};
	prop.action.middlewares.push(mwFunc);
}

export function middleware(middlewareFunc: ((req: Req, res: Res, next: Function) => void) | string) {
	return (target, funcName) => {
		if (typeof middlewareFunc === 'string') {
			addMiddleware(target[funcName], target[middlewareFunc]);
		}
		else {
			addMiddleware(target[funcName], middlewareFunc);
		}
	};
}

//------------------------------------------------------------------------------
// Parameter parsing

function addParam(prop: HttpActionProperty, name: string | symbol, index: number, from: string, type: string, opt: boolean) {
	prop.action = prop.action || {
		url: null,
		method: null,
		params: [],
		middlewares: [],
	};
	prop.action.params.push({ index, from, name, type, opt });
}

// Raw request object
export function req() {
	return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
		let prop = <HttpActionProperty>target[propertyKey];
		addParam(prop, null, parameterIndex, 'req', null, false);
	};
}

// Raw response object
export function res() {
	return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
		let prop = <HttpActionProperty>target[propertyKey];
		addParam(prop, null, parameterIndex, 'res', null, false);
	};
}

function addParamBinding(name: string, optional: boolean, from: string, type: any) {
	return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
		let prop = <HttpActionProperty>target[propertyKey];
		addParam(prop, name, parameterIndex, from, type, optional);
	};
}

function obsWarn(oldAnnotation: string, newAnnotation: string) {
	console.warn(`Obsolete ${oldAnnotation}, use ${newAnnotation} instead`);
}

export function bodyString(name: string, optional?: boolean) { obsWarn('bodyString', 'body'); return addParamBinding(name, optional, 'body', String); }
export function bodyNumber(name: string, optional?: boolean) { obsWarn('bodyNumber', 'body'); return addParamBinding(name, optional, 'body', Number); }
export function bodyObject(name: string, optional?: boolean) { obsWarn('bodyObject', 'body'); return addParamBinding(name, optional, 'body', Object); }
export function bodyArray(name: string, optional?: boolean) { obsWarn('bodyArray', 'body'); return addParamBinding(name, optional, 'body', Array); }
export var body: {
	/** Bind the whole request.body object */
	(type: any): (target: Object, propertyKey: string | symbol, parameterIndex: number) => void;
	/** Bind a member of the request.body object */
	(name: string, type: any, optional?: boolean): (target: Object, propertyKey: string | symbol, parameterIndex: number) => void;
} =
function(name: string | any, type?: any, optional?: boolean) {
	if (typeof name === 'string') {
		return addParamBinding(name, optional, 'body', type);
	}
	return addParamBinding(null, false, 'full-body', type);
};

export function queryString(name: string, optional?: boolean) { obsWarn('queryString', 'query'); return addParamBinding(name, optional, 'query', String); }
export function queryNumber(name: string, optional?: boolean) { obsWarn('queryNumber', 'query'); return addParamBinding(name, optional, 'query', Number); }
export function queryObject(name: string, optional?: boolean) { obsWarn('queryObject', 'query'); return addParamBinding(name, optional, 'query', Object); }
export function queryArray(name: string, optional?: boolean) { obsWarn('queryArray', 'query'); return addParamBinding(name, optional, 'query', Array); }
export function query(name: string, type: any, optional?: boolean) { return addParamBinding(name, optional, 'query', type); }

//------------------------------------------------------------------------------
// Validation

export interface Validator {
	/** Type constructor */
	type: any;
	/** Property checker */
	check(value: any): boolean;
	/** Optional: for parsing items from query */
	parse?(value: string): any;
}

let validators: Validator[] = [
	{ type: String, check: _.isString, parse: input => input },
	{ type: Number, check: _.isNumber, parse: parseInt },
	{ type: Object, check: _.isObject, parse: JSON.parse },
	{ type: Array, check: _.isArray, parse: JSON.parse },
];

export function addValidator(validator: Validator) {
	if (_.some(validators, {type: validator.type})) {
		throw new Error(`Cannot add validator with type ${validator.type}: already parsing that!`);
	}
	validators.push(validator);
}

//------------------------------------------------------------------------------
// Error Handling

export class WebError extends Error {
	static requestErrorTransformer = (error: WebError, message: string, statusCode: number) => {
		error.json = { errors: [ {message} ]};
	};
	statusCode: number;
	text: string;
	json: Object | Array<any>;

	constructor(message: string, statusCode: number = 500) {
		super(message);
		this.statusCode = statusCode;
		WebError.requestErrorTransformer(this, message, statusCode);
	}
}

function handleError(err: Error | any, res: express.Response) {
	err.statusCode = err.statusCode || 500;
	if (err.json) {
		return res.status(err.statusCode).json(err.json);
	}
	if (err.text) {
		return res.status(err.statusCode).send(err.text);
	}
	return res.sendStatus(err.statusCode);
}

//------------------------------------------------------------------------------
// Registering controller

function registerControllerFunction(thisBind: any, app: express.Express, actionFunc: Function, logger: Function) {
	var action = getHttpAction(actionFunc);
	if (!action) { return false; }
	if (!action.method || !action.url) {
		throw new Error('Action has no method: ' + actionFunc);
	}

	let controllerName = thisBind.constructor.__controller.name;
	let url = controllerName + action.url;
	logger && logger('debug', `Registering ${action.method} ${url} [${action.params.map(p => p.name)}]`);

	// Applying middleware
	for (let mwFunc of action.middlewares) {
		logger && logger('debug', `Registering ${action.method} ${url} *MW*`);
		app.use(url, mwFunc.bind(thisBind));
	}

	// Creating parser functions
	let binders = [];
	let autoClose = true;
	for (let bind of action.params) {
		// Request
		if (bind.from === 'req') {
			binders.push((params: any[], req: Req, res: Res) => { params[bind.index] = req; });
			continue;
		}
		// Response
		if (bind.from === 'res') {
			binders.push((params: any[], req: Req, res: Res) => { params[bind.index] = res; });
			autoClose = false;
			continue;
		}
		// Body or Query
		let validator = validators.filter((item) => item.type === bind.type)[0];
		if (!validator) throw new Error(`No validator for type: ${bind.type}`);
		// Full-body: we MUST have body-parser here
		if (bind.from === 'full-body') {
			binders.push((params: any[], req: Req, res: Res) => {
				// Cannot be optional
				if (req.body === undefined) {
					throw new WebError(`Empty Body`, 400);
				}
				if (!validator.check(req.body)) throw new Error(`Invalid value: Body should be a ${bind.type}`);
				params[bind.index] = req.body;
			});
			continue;
		}
		// Body: we MUST have body-parser here
		if (bind.from === 'body') {
			binders.push((params: any[], req: Req, res: Res) => {
				// It MUST be parsed
				let parsed = req.body[bind.name];
				if (parsed === undefined) {
					if (!bind.opt) throw new WebError(`Missing property: ${bind.name}`, 400);
					params[bind.index] = undefined;
					return;
				}
				if (!validator.check(parsed)) throw new Error(`Invalid value: ${bind.name} should be a ${bind.type}`);
				params[bind.index] = parsed;
			});
			continue;
		}
		// Query: we DON'T have body-parser here
		else if (bind.from === 'query') {
			if (!validator.parse) throw new Error(`No parser in validator for type: ${bind.type}; required when binding to query params`);
			binders.push((params: any[], req: Req, res: Res) => {
				let value = req.query[bind.name];
				if (value === undefined) {
					if (!bind.opt) throw new WebError(`Missing property: ${bind.name}`, 400);
					params[bind.index] = undefined;
					return;
				}
				let parsed = validator.parse(value);
				if (!validator.check(parsed)) throw new Error(`Invalid value: ${bind.name} should be a ${bind.type}`);
				params[bind.index] = parsed;
			});
		}
	}

	// Creating actionProcessor
	var actionProcessor: (req: Req, res: Res) => any = (req: Req, res: Res) => {
		let params = new Array(action.params.length);
		try {
			// Applying binders
			for (let binder of binders) binder(params, req, res);

			// Calling the action
			let result = actionFunc.apply(thisBind, params);
			if (!autoClose) return;

			// No result -> We're done
			if (result === undefined)
				return res.sendStatus(200);
			// Promise result -> Wait for it
			else if (result instanceof Promise) {
				(<any>result)
				.then(response => (result !== undefined) ? res.json(response) : res.sendStatus(200))
				.catch(ex => {
					(!ex.statusCode) && logger && logger('error', 'Something broke (Promise)', { ex: ex, message: ex.message, stack: ex.stack });
					handleError(ex, res);
				});
			}
			// Anything else -> Send back as json
			else {
				res.json(result);
			}
		}
		// Internal error
		catch (ex) {
			(!ex.statusCode) && logger && logger('error', 'Something broke (Exception)', { ex: ex, message: ex.message, stack: ex.stack });
			handleError(ex, res);
		}
	};

	// Applying actionProcessor on app
	app[_.toLower(action.method)](url, actionProcessor);
}

// https://stackoverflow.com/questions/31054910/get-functions-methods-of-a-class
function getAllFuncs(obj) {
	var props = [];
	let protoObj = obj;
	while (protoObj) {
		props = props.concat(Object.getOwnPropertyNames(protoObj));
		protoObj = Object.getPrototypeOf(protoObj);
	}
	return props.sort().filter(function(e, i, arr) {
		if (e !== arr[i+1] && typeof obj[e] === 'function') return true;
	});
}

function registerController(controller: BaseController, app: express.Express, logger: Function) {
	let ctor = (<any>controller.constructor);
	if (!ctor || !ctor.__controller || !ctor.__controller.name) {
		throw new Error('Must use @controller decoration on controller!');
	}
	let funcNames = getAllFuncs(controller);
	for (let name of funcNames) {
		let action = ctor.prototype[name];
		if (getHttpAction(action) !== null) {
			registerControllerFunction(controller, app, action, logger);
		}
	}
}

export abstract class BaseController {
	register(app: express.Express, logger: (level: 'debug' | 'error', message: string, meta: any) => void = console.log.bind(console)) {
		registerController(this, app, logger);
	}
}
















//
