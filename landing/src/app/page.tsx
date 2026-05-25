import { HomeApiStyles } from "@/components/home/api-styles";
import { HomeCta } from "@/components/home/cta";
import { HomeFaq } from "@/components/home/faq";
import { HomeFeatures } from "@/components/home/features";
import { HomeFooter } from "@/components/home/footer";
import { HomeHero } from "@/components/home/hero";
import { LandingBackdrop } from "@/components/home/landing-backdrop";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={`page-wrap ${styles.home} relative`}>
      <LandingBackdrop />
      <div className="relative z-[1] w-full min-w-0">
        <HomeHero />
        <HomeFeatures />
        <HomeApiStyles />
        <HomeFaq />
        <HomeCta />
        <HomeFooter />
      </div>
    </div>
  );
}
