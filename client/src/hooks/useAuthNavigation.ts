import { useApp, type Screen } from "@/store/app";

export function useAuthNavigation() {
  const { setScreen, profileId, returnScreen, setReturnScreen } = useApp();

  const goBack = () => {
    const dest = returnScreen ?? 1;
    setReturnScreen(null);
    setScreen(dest);
  };

  const afterAuth = () => {
    const dest = returnScreen ?? (profileId ? 2 : 1);
    setReturnScreen(null);
    setScreen(dest as Screen);
  };

  return { goBack, afterAuth };
}
