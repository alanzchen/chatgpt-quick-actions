import { getPreferenceValues } from "@raycast/api";
import OpenAI from "openai";

const prefs = getPreferenceValues();

const config = prefs.useAzure ? {
  apiKey: prefs.apikey,
  baseURL: `${prefs.azureEndpoint}/openai/deployments/${prefs.azureDeployment}`,
  defaultHeaders: { 'api-key': prefs.apikey },
  ...(prefs.azureAPIVersion) && { defaultQuery: { 'api-version': prefs.azureAPIVersion } },
} : {
  apiKey: prefs.apikey,
}
export const openai = new OpenAI(config);

export const global_model = prefs.model;
export const using_azure = prefs.useAzure;
export const enable_streaming: boolean = prefs.enableStreaming;
