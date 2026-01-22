const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface ApiError {
  message: string;
  statusCode?: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = {
      message: 'An error occurred',
      statusCode: response.status,
    };

    try {
      const data = await response.json();
      error.message = data.message || error.message;
    } catch {
      error.message = response.statusText || error.message;
    }

    throw error;
  }

  return response.json();
}

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  return handleResponse<T>(response);
}

export async function apiUpload(
  endpoint: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = localStorage.getItem('accessToken');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          resolve(xhr.responseText);
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject({ message: error.message || 'Upload failed', statusCode: xhr.status });
        } catch {
          reject({ message: 'Upload failed', statusCode: xhr.status });
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject({ message: 'Network error', statusCode: 0 });
    });

    xhr.open('POST', `${API_URL}${endpoint}`);
    
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

export async function apiDelete(endpoint: string): Promise<any> {
  return apiRequest(endpoint, {
    method: 'DELETE',
  });
}
