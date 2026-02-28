import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary pt-16">
      <Container className="text-center">
        <p className="text-8xl font-bold text-accent mb-4">404</p>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Page not found</h1>
        <p className="text-text-secondary mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button href="/" variant="primary">
            Go home
          </Button>
          <Button href="/docs/getting-started" variant="ghost">
            Documentation
          </Button>
        </div>
      </Container>
    </div>
  );
}
