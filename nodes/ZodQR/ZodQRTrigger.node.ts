import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	IHttpRequestMethods,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

/**
 * ============================================================
 * ASSUMPTIONS - verify each of these against the zodqr API docs
 * ============================================================
 */
const API_BASE_URL = 'https://api.zodqr.com/v1'; // TODO: confirm base URL
const CREDENTIAL_NAME = 'zodqrOAuth2Api'; // TODO: must match name in your credentials file
const ENDPOINTS = {
	listQrCodes: '/qr-codes', // GET  -> { data: [{ id, name }] } or [{ id, name }]
	webhooks: '/webhooks', // POST -> create, GET /{id} -> check, DELETE /{id} -> remove
};
const SCAN_EVENT_NAME = 'qr.scanned'; // TODO: confirm event name zodqr uses for a scan
// Field names in the webhook body. Both camelCase and snake_case variants are tried.
// ============================================================

async function zodqrApiRequest(
	this: IHookFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
): Promise<any> {
	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
			method,
			url: `${API_BASE_URL}${endpoint}`,
			body,
			json: true,
		});
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as any);
	}
}

export class ZodQRTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ZodQR Trigger',
		name: 'zodqrTrigger',
		icon: 'file:zodqr.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{"QR scanned"}}',
		description: 'Starts the workflow when a selected zodqr QR code is scanned',
		defaults: {
			name: 'Zodqr Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: CREDENTIAL_NAME,
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'QR Code Name or ID',
				name: 'qrCodeId',
				type: 'options',
				required: true,
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getQrCodes',
				},
				description:
					'The QR code to watch. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Simplify Output',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description:
					'Whether to return a clean object (qrId, timestamp, location, device, ip) instead of the raw webhook body',
			},
		],
	};

	methods = {
		loadOptions: {
			async getQrCodes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await zodqrApiRequest.call(this, 'GET', ENDPOINTS.listQrCodes);
				const items: IDataObject[] = Array.isArray(response) ? response : (response?.data ?? []);
				return items.map((qr) => ({
					name: String(qr.name ?? qr.id),
					value: String(qr.id),
				}));
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (!staticData.webhookId) return false;

				try {
					await zodqrApiRequest.call(
						this,
						'GET',
						`${ENDPOINTS.webhooks}/${staticData.webhookId as string}`,
					);
					return true;
				} catch (error) {
					// Webhook was deleted on the zodqr side, so it must be recreated
					delete staticData.webhookId;
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const qrCodeId = this.getNodeParameter('qrCodeId') as string;

				const response = await zodqrApiRequest.call(this, 'POST', ENDPOINTS.webhooks, {
					url: webhookUrl,
					event: SCAN_EVENT_NAME,
					qr_code_id: qrCodeId, // TODO: confirm parameter name
				});

				const webhookId = response?.id ?? response?.data?.id;
				if (!webhookId) {
					throw new NodeApiError(this.getNode(), response as any, {
						message: 'zodqr did not return a webhook ID',
					});
				}

				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = String(webhookId);
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (staticData.webhookId) {
					try {
						await zodqrApiRequest.call(
							this,
							'DELETE',
							`${ENDPOINTS.webhooks}/${staticData.webhookId as string}`,
						);
					} catch (error) {
						// Already gone on zodqr side: treat as success so deactivation never gets stuck
						if ((error as any)?.httpCode !== '404') return false;
					}
					delete staticData.webhookId;
				}
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();
		const simplify = this.getNodeParameter('simplify', true) as boolean;

		// Webhook payloads may nest the scan under `data`
		const payload = (body.data as IDataObject | undefined) ?? body;

		if (!simplify) {
			return { workflowData: [this.helpers.returnJsonArray(body)] };
		}

		const output: IDataObject = {
			qrId: payload.qrId ?? payload.qr_id ?? payload.id ?? null,
			timestamp: payload.timestamp ?? payload.scanned_at ?? null,
			location: payload.location ?? null,
			device: payload.device ?? null,
			ip: payload.ip ?? payload.ip_address ?? null,
		};

		return { workflowData: [this.helpers.returnJsonArray(output)] };
	}
}