import { prisma } from "@/lib/db/prisma";

export const supportedVietQrBanks = [
  { code: "ABB", name: "ABBANK" },
  { code: "ACB", name: "ACB" },
  { code: "BIDV", name: "BIDV" },
  { code: "CTG", name: "VietinBank" },
  { code: "EIB", name: "Eximbank" },
  { code: "HDB", name: "HDBank" },
  { code: "MB", name: "MB Bank" },
  { code: "MSB", name: "MSB" },
  { code: "OCB", name: "OCB" },
  { code: "SACOMBANK", name: "Sacombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "TPB", name: "TPBank" },
  { code: "VCB", name: "Vietcombank" },
  { code: "VIB", name: "VIB" },
  { code: "VNPAY", name: "VNPAY" },
  { code: "VPB", name: "VPBank" }
] as const;

export const supportedVietQrBankCodes = new Set<string>(supportedVietQrBanks.map((bank) => bank.code));

export type SubscriptionPaymentReceiverSnapshot = {
  bankCode: string;
  accountNumber: string;
  accountName: string | null;
  configVersion: number;
};

export async function getPlatformSubscriptionPaymentConfig() {
  return prisma.platformSubscriptionPaymentConfig.findUnique({
    where: { singletonKey: "default" }
  });
}

export function getPaymentReceiverSnapshot(config: {
  isEnabled: boolean;
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
  version: number;
}): SubscriptionPaymentReceiverSnapshot | null {
  const bankCode = config.bankCode?.trim().toUpperCase();
  const accountNumber = config.accountNumber?.replace(/\s+/g, "");
  const accountName = config.accountName?.trim() || null;

  if (!config.isEnabled || !bankCode || !accountNumber || !supportedVietQrBankCodes.has(bankCode)) return null;
  return { bankCode, accountNumber, accountName, configVersion: config.version };
}

export async function getCurrentPaymentReceiverSnapshot() {
  const config = await getPlatformSubscriptionPaymentConfig();
  return config ? getPaymentReceiverSnapshot(config) : null;
}
