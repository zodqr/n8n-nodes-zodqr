import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class ZodQROAuth2Api implements ICredentialType {
	icon = 'file:zodqr.svg' as const;

	name = 'zodqrOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'ZodQR OAuth2 API';

	// Link to your community node's README
	documentationUrl = 'https://github.com/org/-zodqr?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://zodqr.huongphamx.dev/oauth/authorize',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://zodqr-api.huongphamx.dev/v1/oauth/token',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'users:read users:write companies:read',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];
}
