import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://api.invoicingbuilder.com';

/**
 * Normalizes baseUrl by stripping trailing slashes and providing default.
 */
export function normalizeBaseUrl(baseUrl?: string): string {
	if (!baseUrl || typeof baseUrl !== 'string') {
		return DEFAULT_BASE_URL;
	}
	const trimmed = baseUrl.trim();
	if (!trimmed) {
		return DEFAULT_BASE_URL;
	}
	return trimmed.replace(/\/+$/, '');
}

/**
 * Helper to make authenticated requests to InvoicingBuilder API.
 */
export async function apiRequest<T = unknown>(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | unknown[] | string | Buffer | undefined = undefined,
	qs: IDataObject = {},
	optionOverrides: Partial<IHttpRequestOptions> = {},
): Promise<T> {
	const credentials = await this.getCredentials('invoicingBuilderApi');
	const baseUrl = normalizeBaseUrl(credentials.baseUrl as string | undefined);
	const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		qs,
		headers: {
			Accept: 'application/json',
		},
		json: true,
		...optionOverrides,
	};

	if (body !== undefined) {
		options.body = body;
	}

	return (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'invoicingBuilderApi',
		options,
	)) as T;
}
