import { Logo, LogoImage, LogoText } from "@/components/shadcnblocks/logo";

interface MenuItem {
  title: string;
  links: {
    text: string;
    url: string;
  }[];
}

interface Footer2Props {
  logo?: {
    url: string;
    src: string;
    alt: string;
    title: string;
  };
  tagline?: string;
  menuItems?: MenuItem[];
  copyright?: string;
  bottomLinks?: {
    text: string;
    url: string;
  }[];
}

const Footer2 = ({
  logo = {
    src: "/ht_logo_nobg.png",
    alt: "Hiring Team Logo",
    title: "Hiring Team",
    url: "/",
  },
  tagline = "Hiring made simple with AI.",
  menuItems = [
    {
      title: "Product",
      links: [
        { text: "Features", url: "#features" },
        { text: "Pricing", url: "#pricing" },
        { text: "Integrations", url: "#integrations" },
        { text: "Documentation", url: "#" },
      ],
    },
    {
      title: "Company",
      links: [
        { text: "About", url: "#" },
        { text: "Blog", url: "#" },
        { text: "Careers", url: "#" },
        { text: "Contact", url: "#" },
      ],
    },
    {
      title: "Resources",
      links: [
        { text: "Help Center", url: "#" },
        { text: "API Docs", url: "#" },
        { text: "Status", url: "#" },
      ],
    },
    {
      title: "Legal",
      links: [
        { text: "Privacy", url: "#" },
        { text: "Terms", url: "#" },
        { text: "Security", url: "#" },
      ],
    },
  ],
  copyright = `© ${new Date().getFullYear()} Hiring Team. All rights reserved.`,
  bottomLinks = [
    { text: "Terms of Service", url: "#" },
    { text: "Privacy Policy", url: "#" },
  ],
}: Footer2Props) => {
  return (
    <section className="py-32">
      <div className="container">
        <footer>
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-6">
            <div className="col-span-2 mb-8 lg:mb-0">
              <div className="flex items-center gap-2 lg:justify-start">
                <Logo url="https://shadcnblocks.com">
                  <LogoImage
                    src={logo.src}
                    alt={logo.alt}
                    title={logo.title}
                    className="h-10"
                  />
                  <LogoText className="text-xl">{logo.title}</LogoText>
                </Logo>
              </div>
              <p className="mt-4 font-bold">{tagline}</p>
            </div>
            {menuItems.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                <h3 className="mb-4 font-bold">{section.title}</h3>
                <ul className="text-muted-foreground space-y-4">
                  {section.links.map((link, linkIdx) => (
                    <li
                      key={linkIdx}
                      className="hover:text-primary font-medium"
                    >
                      <a href={link.url}>{link.text}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-muted-foreground mt-24 flex flex-col justify-between gap-4 border-t pt-8 text-sm font-medium md:flex-row md:items-center">
            <p>{copyright}</p>
            <ul className="flex gap-4">
              {bottomLinks.map((link, linkIdx) => (
                <li key={linkIdx} className="hover:text-primary underline">
                  <a href={link.url}>{link.text}</a>
                </li>
              ))}
            </ul>
          </div>
        </footer>
      </div>
    </section>
  );
};

export { Footer2 };
