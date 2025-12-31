// 基础 API 地址：开发环境下利用 Vite 代理（相对路径），生产环境下从环境变量读取
// 注意：在 Electron 生产环境下，不能使用相对路径，否则会指向磁盘根目录
// 如果 VITE_API_BASE_URL 未定义且处于生产环境的文件协议下，默认尝试连接本地 3000 端口
const API_BASE_URL = (import.meta.env.DEV || !window.location.protocol.startsWith('file'))
  ? '' 
  : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000');

// 导出 API_BASE_URL 供其他模块（如 main.tsx）使用
export { API_BASE_URL };

import { getToken } from './auth-token';

export function getApiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export const fetcher = async (url: string) => {
  const token = getToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  const res = await fetch(getApiUrl(url), { 
    credentials: 'include',
    headers 
  });
  return res.json();
};
