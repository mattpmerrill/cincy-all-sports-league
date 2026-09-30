import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { fonts, palette } from "@/ui/email/palette";
import {
  base,
  type LaunchEmailProps,
  type LaunchStep,
  Note,
  para,
  SectionTitle,
  Step,
} from "./parts";

/** This email reads the same for everyone, so it needs no team flag. */
export type HomeScreenEmailProps = Pick<LaunchEmailProps, "displayName" | "siteUrl">;

export const HOME_SCREEN_SUBJECT = "Put Cincy's League on your phone's Home Screen";
export const HOME_SCREEN_PREHEADER =
  "One tap to standings, trades and free agents. It takes about a minute, and on iPhone it is how you get push alerts.";

/**
 * A step and the picture that shows it. The pictures live on the site (public/email, made by
 * `pnpm email:visuals`): email clients only show hosted images.
 */
export type IllustratedStep = LaunchStep & { image: string; alt: string };

export const imageUrl = (siteUrl: string, image: string) =>
  `${siteUrl}/email/home-screen-${image}.png`;

export const IPHONE_STEPS: readonly IllustratedStep[] = [
  {
    title: "Open the site in Safari",
    body: "Go to cincysports.xyz and tap the ••• button at the right of the address bar. On an older iPhone, tap the Share button instead (the square with an arrow, at the bottom of the screen) and skip to step 3.",
    image: "ios-1",
    alt: "The Safari address bar on an iPhone with the ••• button circled in red",
  },
  {
    title: "Tap Share",
    body: "It's in the menu that opens.",
    image: "ios-2",
    alt: "The Safari menu with the Share row highlighted in red",
  },
  {
    title: "Tap Add to Home Screen",
    body: "Scroll down the list if you don't see it right away.",
    image: "ios-3",
    alt: "The share sheet with the Add to Home Screen row highlighted in red",
  },
  {
    title: "Keep Open as Web App on, then tap Add",
    body: "That switch is what makes it open full screen, like a real app. You can rename it here if you like.",
    image: "ios-4",
    alt: "The Add to Home Screen box with the name Cincy's League, the Open as Web App switch turned on, and the Add button circled in red",
  },
  {
    title: "Open it from your Home Screen",
    body: "Look for the red C. Tap it any time to jump straight in.",
    image: "ios-5",
    alt: "An iPhone Home Screen with the red Cincy's League icon circled",
  },
];

export const ANDROID_STEPS: readonly IllustratedStep[] = [
  {
    title: "Open the site in Chrome",
    body: "Go to cincysports.xyz and tap the ⋮ menu at the top right.",
    image: "android-1",
    alt: "The Chrome address bar on an Android phone with the ⋮ menu circled in red",
  },
  {
    title: "Tap Install app",
    body: "Some phones say Add to Home screen instead. Either one works.",
    image: "android-2",
    alt: "The Chrome menu with the Install app row highlighted in red",
  },
  {
    title: "Tap Install",
    body: "Then look for the red C on your Home screen or in your app drawer.",
    image: "android-3",
    alt: "The Install app box with the Install button circled in red",
  },
];

export type Tip = { lead: string; body: string };

export const HOME_SCREEN_TIPS: readonly Tip[] = [
  {
    lead: "Give it a spot you'll see.",
    body: "Put the icon on your first Home Screen page, or in your dock, so the league is always one tap away.",
  },
  {
    lead: "Watch the red number.",
    body: "When a red number shows on the Trades tab, offers are waiting on you.",
  },
  {
    lead: "Keep the feed open on game day.",
    body: "It updates live, so trades, score updates and trash talk show up without a refresh.",
  },
  {
    lead: "Move fast on free agents.",
    body: "It's first come, first served, and one tap from your Home Screen beats typing the address.",
  },
  {
    lead: "Give your trash talk a face.",
    body: "Open your profile from your avatar in the top corner and add a photo.",
  },
  {
    lead: "Sign in again if it asks.",
    body: "On iPhone the Home Screen app keeps its own login, separate from Safari, so you may need to sign in once the first time you open it.",
  },
];

export const PUSH_ALERTS_NOTE = {
  title: "Push alerts are live",
  body: "The league can now buzz your phone when something happens. On iPhone, alerts only work for apps on your Home Screen, so add it first, then turn alerts on from your profile.",
};

function Picture({ siteUrl, step }: { siteUrl: string; step: IllustratedStep }) {
  return (
    <Img
      src={imageUrl(siteUrl, step.image)}
      width="552"
      alt={step.alt}
      style={{
        display: "block",
        width: "100%",
        maxWidth: "552px",
        height: "auto",
        borderRadius: "12px",
        marginTop: "10px",
      }}
    />
  );
}

function Illustrated({ steps, siteUrl }: { steps: readonly IllustratedStep[]; siteUrl: string }) {
  return steps.map((step, i) => (
    <Section key={step.title} style={{ paddingBottom: "8px" }}>
      <Step n={i + 1} step={step} />
      <Picture siteUrl={siteUrl} step={step} />
    </Section>
  ));
}

export function HomeScreenEmail({ displayName, siteUrl }: HomeScreenEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <title>{HOME_SCREEN_SUBJECT}</title>
      </Head>
      <Preview>{HOME_SCREEN_PREHEADER}</Preview>
      <Body style={{ ...base, backgroundColor: palette.page, padding: "24px 12px" }}>
        <Container style={{ maxWidth: "600px", width: "100%", margin: "0 auto" }}>
          <Section
            style={{
              backgroundColor: palette.ink,
              borderRadius: "12px 12px 0 0",
              padding: "36px 24px 4px",
            }}
          >
            <Text
              style={{
                ...base,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: palette.line,
              }}
            >
              Get more from the app
            </Text>
            <Text
              style={{
                ...base,
                fontSize: "32px",
                fontWeight: 800,
                lineHeight: "38px",
                color: palette.onBrand,
                padding: "8px 0 0",
              }}
            >
              Put the league on your Home Screen
            </Text>
            <Text
              style={{
                ...base,
                fontSize: "16px",
                lineHeight: "24px",
                color: palette.line,
                padding: "10px 0 0",
              }}
            >
              It works like a real app. No app store needed.
            </Text>
          </Section>
          <Section style={{ backgroundColor: palette.ink }}>
            <Img
              src={imageUrl(siteUrl, "hero")}
              width="600"
              alt="The Cincy's League app open full screen on a phone, with the notes One tap away, Full screen with no browser bars, and No app store needed"
              style={{ display: "block", width: "100%", maxWidth: "600px", height: "auto" }}
            />
          </Section>

          <Section
            style={{
              backgroundColor: palette.card,
              borderRadius: "0 0 12px 12px",
              padding: "8px 24px 28px",
            }}
          >
            <Text style={{ ...para, paddingTop: "20px" }}>{`Hi ${displayName},`}</Text>
            <Text style={{ ...para, paddingTop: "8px" }}>
              You can add Cincy&apos;s League to your phone&apos;s Home Screen so it opens full
              screen, like any other app, in one tap. It takes about a minute, and on an iPhone it
              is how you get push alerts.
            </Text>

            <SectionTitle>On an iPhone (use Safari)</SectionTitle>
            <Illustrated steps={IPHONE_STEPS} siteUrl={siteUrl} />

            <SectionTitle>On an Android phone (use Chrome)</SectionTitle>
            <Illustrated steps={ANDROID_STEPS} siteUrl={siteUrl} />

            <SectionTitle>Tips and tricks</SectionTitle>
            {HOME_SCREEN_TIPS.map((tip) => (
              <Note key={tip.lead}>
                <strong>{tip.lead}</strong> {tip.body}
              </Note>
            ))}

            <Section
              style={{
                marginTop: "24px",
                padding: "16px 18px",
                borderRadius: "10px",
                backgroundColor: palette.brandTint,
              }}
            >
              <Text style={{ ...base, fontSize: "16px", fontWeight: 800, color: palette.brand }}>
                {PUSH_ALERTS_NOTE.title}
              </Text>
              <Text style={{ ...para, fontSize: "15px", lineHeight: "22px", paddingTop: "6px" }}>
                {PUSH_ALERTS_NOTE.body}
              </Text>
            </Section>

            <Section style={{ paddingTop: "28px", textAlign: "center" }}>
              <Button
                href={siteUrl}
                style={{
                  backgroundColor: palette.brand,
                  color: palette.onBrand,
                  borderRadius: "8px",
                  padding: "14px 28px",
                  fontFamily: fonts.sans,
                  fontSize: "16px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Open Cincy&apos;s League
              </Button>
            </Section>
            <Text
              style={{
                ...base,
                fontSize: "14px",
                color: palette.muted,
                textAlign: "center",
                paddingTop: "14px",
              }}
            >
              Stuck? Ask in the{" "}
              <Link href={`${siteUrl}/feed`} style={{ color: palette.brand }}>
                league feed
              </Link>{" "}
              and someone will help you out.
            </Text>
          </Section>

          <Text
            style={{
              ...base,
              fontSize: "12px",
              lineHeight: "18px",
              color: palette.muted,
              textAlign: "center",
              padding: "16px 12px 0",
            }}
          >
            You&apos;re getting this one-time announcement because you have an account with
            Cincy&apos;s All-Sports League.{" "}
            <Link href={siteUrl} style={{ color: palette.muted }}>
              cincysports.xyz
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
