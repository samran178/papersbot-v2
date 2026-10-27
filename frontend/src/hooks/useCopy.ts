import { toast } from "sonner";

export const copyText = async (text: string, label = "Copied") => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it manually.");
  }
};
