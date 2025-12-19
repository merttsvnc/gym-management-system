import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { toApiError } from "@/types/error";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
      // Success: redirect to dashboard
      navigate("/settings/tenant");
    } catch (e) {
      const err = toApiError(e);

      // EXACT DECISION TREE:
      if (err.statusCode === 403 && err.code === "TENANT_BILLING_LOCKED") {
        // Clear auth storage
        localStorage.removeItem("gymms_auth");
        localStorage.removeItem("jwt_token");
        // Redirect to billing locked page with NO error message
        setIsLoading(false);
        navigate("/billing-locked");
        return;
      } else if (err.statusCode === 401 || err.code === "INVALID_CREDENTIALS") {
        // Invalid credentials
        setError("E-posta veya şifre hatalı");
      } else {
        // Generic error (network, 5xx, etc.)
        setError("Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-[480px]">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <h1 className="text-2xl font-semibold">Gym Admin</h1>
          </div>
          <CardTitle className="text-2xl text-center">
            Hesabınıza giriş yapın
          </CardTitle>
          <CardDescription className="text-center">
            Spor salonu yönetim panelinize erişmek için e-posta ve şifrenizi
            girin.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                type="email"
                placeholder="ornek@eposta.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                placeholder="Şifrenizi girin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Giriş yapılıyor..." : "Giriş yap"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Giriş yaparken sorun yaşıyorsanız yöneticinizle iletişime geçin.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
