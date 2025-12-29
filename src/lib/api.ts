// 基础 API 地址：开发环境下利用 Vite 代理（相对路径），生产环境下从环境变量读取
const API_BASE_URL = import.meta.env.DEV 
  ? '' 
  : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000');

export function getApiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export const fetcher = (url: string) => 
  fetch(getApiUrl(url), { credentials: 'include' }).then((res) => res.json());
