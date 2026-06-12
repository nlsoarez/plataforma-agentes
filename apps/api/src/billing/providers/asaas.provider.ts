import { BadRequestException, Injectable } from '@nestjs/common';

export type AsaasBillingType = 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';
export type AsaasCycle = 'MONTHLY' | 'YEARLY';

export interface AsaasCustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  externalReference: string;
}

export interface AsaasSubscriptionInput {
  customerId: string;
  billingType: AsaasBillingType;
  value: number;
  cycle: AsaasCycle;
  nextDueDate: string;
  description: string;
  externalReference: string;
}

@Injectable()
export class AsaasProvider {
  async createCustomer(input: AsaasCustomerInput): Promise<any> {
    return this.request('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        mobilePhone: input.phone,
        externalReference: input.externalReference,
      }),
    });
  }

  async createSubscription(input: AsaasSubscriptionInput): Promise<any> {
    return this.request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: input.customerId,
        billingType: input.billingType,
        value: input.value,
        nextDueDate: input.nextDueDate,
        cycle: input.cycle,
        description: input.description,
        externalReference: input.externalReference,
      }),
    });
  }

  async listSubscriptionPayments(subscriptionId: string): Promise<any[]> {
    const payload = await this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments`, {
      method: 'GET',
    });
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  async getPixQrCode(paymentId: string): Promise<any | null> {
    try {
      return await this.request(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`, { method: 'GET' });
    } catch {
      return null;
    }
  }

  private async request(path: string, init: RequestInit): Promise<any> {
    const key = process.env.ASAAS_API_KEY;
    if (!key) throw new BadRequestException('ASAAS_API_KEY nao configurada');

    const base = (process.env.ASAAS_API_URL || 'https://api.asaas.com/v3').replace(/\/+$/, '');
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': process.env.ASAAS_USER_AGENT || 'Attende/1.0',
        access_token: key,
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text || `Asaas retornou HTTP ${response.status}` };
    }
    if (!response.ok) {
      const message = payload?.errors?.[0]?.description || payload?.message || `falha na API Asaas (${response.status})`;
      throw new BadRequestException(message);
    }
    return payload;
  }
}
