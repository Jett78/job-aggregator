import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-black tracking-tight">404</h1>
        <h2 className="mt-2 text-2xl font-bold">Page not found</h2>
        <p className="mt-2 text-muted-foreground">
          The page you’re looking for doesn’t exist or has been moved.
        </p>
        <Link href="/" className={buttonVariants({ className: 'mt-6' })}>
          Back to jobs
        </Link>
      </div>
    </div>
  );
}
