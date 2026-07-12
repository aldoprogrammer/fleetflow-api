export interface ApiErrorPayload {
  success: false;
  statusCode: number;
  message: string;
  timestamp: string;
}

export interface ApiSuccessPayload<T> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
}

export interface AuthenticatedMerchant {
  id: string;
  companyName: string;
  email: string;
  balance: number;
  apiKey: string;
  createdAt: Date;
}

declare module 'express-serve-static-core' {
  interface Request {
    merchant?: AuthenticatedMerchant;
  }
}
