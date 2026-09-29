declare module "@paystack/inline-js" {
  interface TransactionOptions {
    key: string;
    accessCode?: string;
    channels?: string[];
    onSuccess: (transaction: { reference: string }) => void | Promise<void>;
    onCancel?: () => void;
  }

  export default class PaystackPop {
    newTransaction(options: TransactionOptions): void;
  }
}
