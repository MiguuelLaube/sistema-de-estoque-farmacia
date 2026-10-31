import { ref } from 'vue';

export type DialogTipo = 'perigo' | 'aviso' | 'info' | 'sucesso';

export interface DialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tipo?: DialogTipo;
  isConfirm?: boolean;
}

const isOpen = ref(false);
const options = ref<DialogOptions>({
  message: '',
});

let resolvePromise: ((value: boolean) => void) | null = null;

export function useConfirmDialog() {
  function confirm(opts: string | DialogOptions): Promise<boolean> {
    const dialogOpts: DialogOptions =
      typeof opts === 'string'
        ? { message: opts, isConfirm: true, tipo: 'perigo' }
        : { isConfirm: true, tipo: opts.tipo || 'perigo', ...opts };

    options.value = dialogOpts;
    isOpen.value = true;

    return new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
    });
  }

  function alert(opts: string | DialogOptions): Promise<void> {
    const dialogOpts: DialogOptions =
      typeof opts === 'string'
        ? { message: opts, isConfirm: false, tipo: 'info' }
        : { isConfirm: false, tipo: opts.tipo || 'info', ...opts };

    options.value = dialogOpts;
    isOpen.value = true;

    return new Promise<void>((resolve) => {
      resolvePromise = () => resolve();
    });
  }

  function onConfirm() {
    isOpen.value = false;
    if (resolvePromise) {
      resolvePromise(true);
      resolvePromise = null;
    }
  }

  function onCancel() {
    isOpen.value = false;
    if (resolvePromise) {
      resolvePromise(false);
      resolvePromise = null;
    }
  }

  return {
    isOpen,
    options,
    confirm,
    alert,
    onConfirm,
    onCancel,
  };
}

// Intercepta window.alert globalmente para evitar caixas de diálogo nativas do navegador
if (typeof window !== 'undefined') {
  window.alert = (msg?: any) => {
    const dialog = useConfirmDialog();
    dialog.alert(String(msg ?? ''));
  };
}
