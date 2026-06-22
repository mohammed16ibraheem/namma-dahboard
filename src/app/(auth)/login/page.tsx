"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const BRAND = "#1B3A6B";

const USERS = [
  {
    email: "Shariqueshadab@alyaqeen-adv.com",
    password: "12345",
    redirect: "/companies",
  },
  {
    email: "it@namma-alenjaz.com",
    password: "12345",
    redirect: "/companies/namma",
  },
];

// Frontend-only: no validation, login goes straight to /dashboard.
const loginSchema = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(_values: LoginFormValues) {
    // Frontend-only flow — skip auth and go straight to the dashboard.
    setIsLoading(true);
    setAuthError("");
    await new Promise((r) => setTimeout(r, 400));
    router.push("/dashboard");
  }

  return (
    <>
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes floatA {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-30px) scale(1.05); }
        }
        @keyframes floatB {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(25px) scale(0.97); }
        }
        @keyframes floatC {
          0%, 100% { transform: translate(0px, 0px); }
          33%       { transform: translate(15px, -20px); }
          66%       { transform: translate(-10px, 10px); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0px) scale(1); }
        }
        .animated-bg {
          background: linear-gradient(135deg, #0f2547, #1B3A6B, #1a5276, #0d3b6e, #163f6b);
          background-size: 400% 400%;
          animation: gradientShift 10s ease infinite;
        }
        .blob-a {
          animation: floatA 8s ease-in-out infinite;
        }
        .blob-b {
          animation: floatB 11s ease-in-out infinite;
        }
        .blob-c {
          animation: floatC 14s ease-in-out infinite;
        }
        .card-in {
          animation: cardIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      {/* Animated gradient background */}
      <div className="animated-bg min-h-screen flex items-center justify-center px-4 relative overflow-hidden">

        {/* Decorative blobs */}
        <div className="blob-a absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #4a9eda, transparent)" }} />
        <div className="blob-b absolute -bottom-32 -right-20 w-[28rem] h-[28rem] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #2e86c1, transparent)" }} />
        <div className="blob-c absolute top-1/2 left-10 w-64 h-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #85c1e9, transparent)" }} />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Login card */}
        <Card className="card-in relative z-10 w-full max-w-md rounded-3xl border-0 py-10"
          style={{
            background: "rgba(255, 255, 255, 0.97)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.35), 0 8px 20px rgba(0,0,0,0.2)",
          }}
        >
          {/* Logo + divider */}
          <CardHeader className="flex flex-col items-center gap-0 pb-6 px-12">
            <Image
              src="/logo.png"
              alt="Diamond Star Arabia Industrial Company"
              width={210}
              height={130}
              priority
              className="object-contain w-full h-auto"
            />
            <div className="w-full border-t border-gray-200 mt-6" />
          </CardHeader>

          <CardContent className="px-12 pt-4 pb-4">
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-5"
              noValidate
            >
              {/* Email */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  className="h-12 rounded-xl border-gray-200 bg-gray-50 placeholder:text-gray-400 focus-visible:border-[#1B3A6B] focus-visible:ring-2 focus-visible:ring-[#1B3A6B]/20 focus-visible:bg-white transition-colors text-sm"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="h-12 rounded-xl border-gray-200 bg-gray-50 placeholder:text-gray-400 focus-visible:border-[#1B3A6B] focus-visible:ring-2 focus-visible:ring-[#1B3A6B]/20 focus-visible:bg-white transition-colors text-sm pr-11"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
              </div>

              {/* Auth error */}
              {authError && (
                <p className="text-xs text-red-500 text-center -mt-1">{authError}</p>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={isLoading}
                className="mt-3 h-12 w-full rounded-full text-base font-semibold text-white disabled:opacity-70 transition-all duration-200"
                style={{
                  backgroundColor: BRAND,
                  boxShadow: `0 4px 18px ${BRAND}55`,
                }}
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  "Log in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
