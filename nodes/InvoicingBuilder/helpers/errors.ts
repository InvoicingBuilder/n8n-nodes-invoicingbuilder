import type { JsonObject } from 'n8n-workflow';

export interface FormattedApiError {
	response: JsonObject;
	message?: string;
	httpCode?: string;
}

/**
 * Extracts and formats error details from API responses.
 * Maps 401, 429, 400, 404 to user-friendly messages while safeguarding API keys.
 */
export function formatApiError(error: unknown): FormattedApiError {
	const err = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>;
	const response = (err.response && typeof err.response === 'object' ? err.response : {}) as Record<
		string,
		unknown
	>;
	const responseData = (
		response.data && typeof response.data === 'object' ? response.data : undefined
	) as Record<string, unknown> | undefined;
	const headers = (
		response.headers && typeof response.headers === 'object' ? response.headers : {}
	) as Record<string, unknown>;

	const status =
		typeof response.status === 'number'
			? response.status
			: typeof err.statusCode === 'number'
				? err.statusCode
				: typeof err.status === 'number'
					? err.status
					: typeof err.httpCode === 'string'
						? parseInt(err.httpCode, 10)
						: undefined;

	const httpCode = status ? String(status) : undefined;
	let message: string | undefined;

	if (status === 401) {
		message = 'Invalid, revoked or expired API key';
	} else if (status === 429) {
		const retryAfter =
			responseData?.retryAfter ??
			headers['retry-after'];

		message = retryAfter
			? `Rate limit exceeded; retry in ${retryAfter} seconds`
			: 'Rate limit exceeded';
	} else if (status === 400 || status === 404) {
		const rawMsg = responseData?.message || (err.message as string | undefined);
		message = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg ? String(rawMsg) : undefined;
	} else if (responseData?.message) {
		const rawMsg = responseData.message;
		message = Array.isArray(rawMsg) ? rawMsg.join(', ') : String(rawMsg);
	}

	const errorResponse: JsonObject = responseData
		? (responseData as JsonObject)
		: { message: (err.message as string) || 'Unknown error' };

	return {
		response: errorResponse,
		message,
		httpCode,
	};
}
