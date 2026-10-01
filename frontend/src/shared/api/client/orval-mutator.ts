import axios, { type AxiosAdapter, type AxiosRequestConfig } from "axios";

const client = axios.create({ withCredentials: true });

export function configureApiAdapter(adapter: AxiosAdapter) {
  client.defaults.adapter = adapter;
}

export type ErrorType<ErrorData> = ErrorData;
export type BodyType<BodyData> = BodyData;

export async function apiMutator<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  const response = await client.request<T>({
    ...config,
    ...options,
    headers: { ...config.headers, ...options?.headers },
  });
  return response.data;
}
