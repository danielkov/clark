"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";

interface PricingPlan {
  name: string;
  badge: string;
  monthlyPrice: string;
  yearlyPrice: string;
  features: string[];
  buttonText: string;
  isPopular?: boolean;
}

interface PricingTiers {
  free: {
    name: string;
    description: string;
    monthlyPrice: string;
    yearlyPrice: string;
    features: string[];
  };
  pro: {
    name: string;
    description: string;
    monthlyPrice: string;
    yearlyPrice: string;
    features: string[];
  };
  enterprise: {
    name: string;
    description: string;
    monthlyPrice: string;
    yearlyPrice: string;
    features: string[];
  };
}

interface Pricing4Props {
  title?: string;
  description?: string;
  plans?: PricingPlan[];
  pricingTiers?: PricingTiers;
  className?: string;
}

const Pricing4 = ({
  title = "Simple, Transparent Pricing",
  description = "Start free and scale as you grow. No hidden fees, no surprises.",
  plans,
  pricingTiers,
  className = "",
}: Pricing4Props) => {
  // Use dynamic pricing if provided, otherwise fall back to default plans
  const defaultPlans = [
    {
      name: pricingTiers?.free.name || "Starter",
      badge: "Free",
      monthlyPrice: pricingTiers?.free.monthlyPrice || "$0",
      yearlyPrice: pricingTiers?.free.yearlyPrice || "$0",
      features: pricingTiers?.free.features || [
        "Up to 3 active job listings",
        "AI job description generation",
        "Basic candidate screening",
        "Linear integration",
        "Email support",
      ],
      buttonText: "Get Started",
    },
    {
      name: pricingTiers?.pro.name || "Professional",
      badge: "Pro",
      monthlyPrice: pricingTiers?.pro.monthlyPrice || "$99",
      yearlyPrice: pricingTiers?.pro.yearlyPrice || "$999",
      features: pricingTiers?.pro.features || [
        "Unlimited job listings",
        "Advanced AI screening",
        "Custom tone of voice",
        "Priority support",
        "Datadog observability",
        "Webhook integrations",
      ],
      buttonText: "Start Free Trial",
      isPopular: true,
    },
    {
      name: pricingTiers?.enterprise.name || "Enterprise",
      badge: "Enterprise",
      monthlyPrice: pricingTiers?.enterprise.monthlyPrice || "Custom",
      yearlyPrice: pricingTiers?.enterprise.yearlyPrice || "Custom",
      features: pricingTiers?.enterprise.features || [
        "Everything in Pro",
        "Dedicated account manager",
        "Custom AI model training",
        "SLA guarantees",
        "Advanced analytics",
        "White-label options",
      ],
      buttonText: "Contact Sales",
    },
  ];
  
  const displayPlans = plans || defaultPlans;
  const [isAnnually, setIsAnnually] = useState(false);
  return (
    <section className={`py-32 ${className}`}>
      <div className="container">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <h2 className="text-pretty text-4xl font-bold lg:text-6xl">
            {title}
          </h2>
          <div className="flex flex-col justify-between gap-10 md:flex-row">
            <p className="text-muted-foreground max-w-3xl lg:text-xl">
              {description}
            </p>
            <div className="bg-muted flex h-11 w-fit shrink-0 items-center rounded-md p-1 text-lg">
              <RadioGroup
                defaultValue="monthly"
                className="h-full grid-cols-2"
                onValueChange={(value) => {
                  setIsAnnually(value === "annually");
                }}
              >
                <div className='has-[button[data-state="checked"]]:bg-background h-full rounded-md transition-all'>
                  <RadioGroupItem
                    value="monthly"
                    id="monthly"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="monthly"
                    className="text-muted-foreground peer-data-[state=checked]:text-primary flex h-full cursor-pointer items-center justify-center px-7 font-semibold"
                  >
                    Monthly
                  </Label>
                </div>
                <div className='has-[button[data-state="checked"]]:bg-background h-full rounded-md transition-all'>
                  <RadioGroupItem
                    value="annually"
                    id="annually"
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor="annually"
                    className="text-muted-foreground peer-data-[state=checked]:text-primary flex h-full cursor-pointer items-center justify-center gap-1 px-7 font-semibold"
                  >
                    Yearly
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <div className="flex w-full flex-col items-stretch gap-6 md:flex-row">
            {displayPlans.map((plan) => (
              <div
                key={plan.name}
                className={`flex w-full flex-col rounded-lg border p-6 text-left ${
                  plan.isPopular ? "bg-muted" : ""
                }`}
              >
                <Badge className="mb-8 block w-fit uppercase">
                  {plan.badge}
                </Badge>
                <span className="text-4xl font-medium">
                  {isAnnually ? plan.yearlyPrice : plan.monthlyPrice}
                </span>
                <p
                  className={`text-muted-foreground ${plan.monthlyPrice === "$0" ? "invisible" : ""}`}
                >
                  {isAnnually ? "Per year" : "Per month"}
                </p>
                <Separator className="my-6" />
                <div className="flex h-full flex-col justify-between gap-20">
                  <ul className="text-muted-foreground space-y-4">
                    {plan.features.map((feature, featureIndex) => (
                      <li
                        key={featureIndex}
                        className="flex items-center gap-2"
                      >
                        <Check className="size-4" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full">{plan.buttonText}</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export { Pricing4 };
