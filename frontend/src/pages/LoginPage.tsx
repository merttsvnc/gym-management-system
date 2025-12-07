import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
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
      // Redirect to dashboard after successful login
      navigate("/settings/tenant");
    } catch (err) {
      // Map error codes to Turkish user-friendly messages
      let errorMessage =
        "Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.";
      if (err instanceof Error) {
        if (err.message === "INVALID_CREDENTIALS") {
          errorMessage = "E-posta veya şifre hatalı.";
        } else if (err.message === "LOGIN_FAILED") {
          errorMessage =
            "Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.";
        }
      }
      setError(errorMessage);
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
