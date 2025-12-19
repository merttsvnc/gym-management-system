import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BILLING_BANNER_MESSAGES } from "@/lib/constants/billing-messages";
import { XCircle, LogOut } from "lucide-react";

/**
 * LockedScreen component displays a full-screen overlay
 * for SUSPENDED tenants, preventing all UI interactions
 */
export function LockedScreen() {
  const { logout } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={(e) => e.preventDefault()} />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/20">
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl">
            {BILLING_BANNER_MESSAGES.SUSPENDED.title}
          </CardTitle>
          <CardDescription className="mt-2 text-base">
            {BILLING_BANNER_MESSAGES.SUSPENDED.message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              Bu süre boyunca yeni kayıt, güncelleme ve silme işlemleri
              yapılamaz. Mevcut verileriniz korunur ve ödeme onaylandıktan sonra
              hesabınız yeniden aktif edilir.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() =>
                (window.location.href = "mailto:support@example.com")
              }
              variant="default"
              className="w-full"
              size="lg"
            >
              Destek ile İletişime Geç
            </Button>
            <Button
              onClick={logout}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Çıkış Yap
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Destek için: support@example.com
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
