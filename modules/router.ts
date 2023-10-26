import {
	ServerClientOptions,
	AutoreloadClient,
	RouteObject,
	RouteHandler,
	RouteContext,
	DenoServeHandler,
} from '../types.ts';

import * as Utilities from '../util.ts';
import { serve_dir, join_path } from '../dependencies.ts';

export function Router(options: ServerClientOptions, autoreload_client: AutoreloadClient) {
	function init() {
		//...
	}

	function get(route_path: string, ...route_handlers: RouteHandler[]): RouteObject {
		if (Utilities.in_development_mode) {
			route_handlers.unshift(autoreload_client.middleware);
		}

		return {
			method: 'GET',
			path: route_path,
			handlers: route_handlers,
		};
	}

	function post(route_path: string, ...route_handlers: RouteHandler[]): RouteObject {
		return {
			method: 'POST',
			path: route_path,
			handlers: route_handlers,
		};
	}

	function directory(route_path: string): RouteObject {
		async function serve_directory(context: RouteContext) {
			const static_headers = {
				'cache-control': 'public, max-age=31536000, must-revalidate',
			};

			const response = await serve_dir(context.request, {
				fsRoot: join_path(Deno.cwd(), options.renderer.frontend_directory),
				quiet: true,
			});

			for (const key in static_headers) {
				response.headers.append(key, static_headers[key]);
			}

			return response;
		}

		return {
			method: 'GET',
			path: route_path,
			handlers: [serve_directory],
		};
	}

	function route(routes: RouteObject[]): DenoServeHandler {
		return async (request, info) => {
			try {
				for (const route of routes) {
					const route_url = new URLPattern({ pathname: route.path });
					const route_url_match = route_url.exec(request.url);

					if (route_url_match !== null) {
						const request_url = new URL(request.url);
						const search_params = new URLSearchParams(request_url.search);
						const route_params = route_url_match.pathname.groups;
						const route_search_params = get_params_as_object(search_params);

						if (request.method === route.method) {
							const route_context: RouteContext = {
								request: request,
								info: info,
								params: route_params,
								search_params: route_search_params,
							};

							const route_handler = get_nested_route_handler(route.handlers, route_context);

							return await route_handler(route_context);
						}
					}
				}

				return new Response('404', { status: 404 });
			} catch (error) {
				console.error(error);
				return new Response(error.message, { status: 500 });
			}
		};
	}

	async function serve(routes: RouteObject[]) {
		const serve_options = {
			port: options.port,
			onListen: () => {},
		};

		Deno.serve(serve_options, route(routes));
	}

	function get_nested_route_handler(handlers: RouteHandler[], context: RouteContext): RouteHandler {
		return handlers.reduceRight((parent: RouteHandler, current: RouteHandler) => {
			return current.bind(null, context, parent.bind(null, context));
		});
	}

	function get_params_as_object(params: URLSearchParams) {
		const result = {};

		for (const [key, value] of params.entries()) {
			result[key] = value;
		}

		return result;
	}

	return {
		get,
		post,
		directory,
		serve,
		init,
	};
}
