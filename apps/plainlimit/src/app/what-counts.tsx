import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import {
  ALLOWED_ID,
  COUNTED_ID,
  SCREEN_TIME_AVAILABLE,
  pickCount,
} from "@/platform/screenTime";
import { store, useDoc } from "@/state/store";
import { AppPicker } from "@/ui/AppPicker";
import {
  BigButton,
  Card,
  Choice,
  Label,
  Lead,
  LinkRow,
  Page,
  Title,
} from "@/ui/kit";
import { c } from "@/ui/theme";
import { useDay } from "@/ui/useDay";

export default function WhatCounts() {
  const { settings, accent } = useDay();
  const [picking, setPicking] = useState(false);
  const { settings: saved } = useDoc();
  const picked = pickCount(COUNTED_ID);
  const allowed = SCREEN_TIME_AVAILABLE
    ? pickCount(ALLOWED_ID)
    : saved.allowed.length;
  // On a real iPhone the second choice is whatever is ticked in Apple's list.
  // (There used to be a third, "Your own picks", held for Pro and never built:
  // on a phone the ticking is the only way to choose at all, so it was the
  // second choice under another name.)
  const choosing = SCREEN_TIME_AVAILABLE && settings.countMode !== "everything";
  return (
    <Page top={8}>
      <Title>What counts</Title>
      <Lead>
        Two things in one choice: which apps use up the battery, and which lock
        when it&apos;s empty.
      </Lead>
      <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
        <Choice
          title="Everything"
          rows={[
            ["Uses up the battery", "Every app, always-allowed ones too"],
            ["Locks when empty", "Every app except your always-allowed ones"],
          ]}
          chosen={settings.countMode === "everything"}
          accent={accent}
          onPress={() => store.setCountMode("everything")}
        />
        <Choice
          title="Only what I tick"
          rows={[
            ["Uses up the battery", "Only the apps and categories you tick"],
            ["Locks when empty", "Only those, and never an always-allowed one"],
          ]}
          line={
            SCREEN_TIME_AVAILABLE
              ? undefined
              : "On an iPhone you tick them in Apple\u2019s own list of your apps."
          }
          chosen={settings.countMode !== "everything"}
          accent={accent}
          onPress={() => store.setCountMode("timeWasters")}
        />
      </View>
      {choosing ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 21,
              color: picked === 0 ? c.ink : c.ink2,
            }}
          >
            {picked === 0
              ? "Nothing is ticked yet, so nothing drains the battery."
              : picked === 1
                ? "1 app or category is ticked."
                : `${picked} apps and categories are ticked.`}
          </Text>
          <BigButton
            label={picked === 0 ? "Choose apps" : "Change the apps"}
            onPress={() => setPicking(true)}
          />
          <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink3 }}>
            For the usual time-wasters, tick Social, Games and Entertainment.
          </Text>
        </View>
      ) : null}
      <View style={{ marginTop: 18, gap: 8 }}>
        <Label>Always allowed</Label>
        <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink2 }}>
          Always-allowed apps never lock, in either choice. They still use up
          the battery when they count: always with Everything, and with Only
          what I tick only if you tick them too.
        </Text>
        <Card>
          <LinkRow
            label="Always allowed"
            value={allowed === 1 ? "1 app" : `${allowed} apps`}
            onPress={() => router.push("/allowed")}
            last
          />
        </Card>
      </View>
      <AppPicker
        id={COUNTED_ID}
        open={picking}
        header="Tick what drains your battery"
        onClose={() => {
          setPicking(false);
          store.picksChanged();
        }}
      />
    </Page>
  );
}
