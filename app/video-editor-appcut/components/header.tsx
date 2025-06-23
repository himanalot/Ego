"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";
import { HeaderBase } from "./header-base";

export function Header() {
  const leftContent = (
    <Link href="/" className="flex items-center gap-3">
      <Image src="/logo.png" alt="AppCut Logo" width={24} height={24} />
      <span className="font-medium tracking-tight">AppCut</span>
    </Link>
  );

  const rightContent = (
    <nav className="flex items-center">
      <Link href="https://github.com/mazeincoding/AppCut" target="_blank">
        <Button variant="ghost" className="text-sm">
          GitHub
        </Button>
      </Link>
      <Link href="/editor">
        <Button size="sm" className="text-sm ml-4">
          Start editing
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </nav>
  );

  return <HeaderBase leftContent={leftContent} rightContent={rightContent} />;
}
