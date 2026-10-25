import { useEffect, useState } from "react";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Book,
  Check,
  ChevronLeft,
  CircleHelp,
  Clipboard,
  ExternalLink,
  Github,
  Info,
  LogOut,
  Mail,
  MessagesSquare,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  TriangleAlertIcon,
  User,
  UserPlus,
  Users
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { AnnouncementNavButton } from "@app/components/announcements/AnnouncementNavButton";
import { Mfa } from "@app/components/auth/Mfa";
import { createNotification } from "@app/components/notifications";
import { NewSubOrganizationModal } from "@app/components/organization/NewSubOrganizationModal";
import { OrgPermissionCan } from "@app/components/permissions";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Badge,
  Button,
  ButtonGroup,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  InstanceIcon,
  OrgIcon,
  SubOrgIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SidebarTrigger } from "@app/components/v3/generic/Sidebar";
import { type Theme, useTheme } from "@app/components/v3/platform/ThemeProvider";
import { envConfig } from "@app/config/env";
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects,
  useOrganization,
  useServerConfig,
  useSubscription,
  useUser
} from "@app/context";
import { OrgPermissionSubOrgActions } from "@app/context/OrgPermissionContext/types";
import { isInfisicalCloud } from "@app/helpers/platform";
import { getOrgScopedProductFromPath } from "@app/helpers/project";
import { useToggle } from "@app/hooks";
import { subOrganizationsQuery, useGetOrganizations, useLogoutUser } from "@app/hooks/api";
import { authKeys, fetchAuthToken, selectOrganization } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { Organization } from "@app/hooks/api/types";
import { AuthMethod } from "@app/hooks/api/users/types";
import {
  NavbarBlock,
  NavbarSwitcher,
  NavbarSwitcherContent,
  NavbarSwitcherTrigger
} from "@app/layouts/NavbarSwitcher";
import {
  ApplicationSelect,
  ProjectSelect
} from "@app/layouts/ProjectLayout/components/ProjectSelect";
import { TypeSelect } from "@app/layouts/ProjectLayout/components/TypeSelect";
import { navigateUserToOrg } from "@app/pages/auth/LoginPage/Login.utils";
import { PersonalBrand } from "@app/pages/organization/ApiVaultPage/PersonalBrand";

import { ServerAdminsPanel } from "../ServerAdminsPanel/ServerAdminsPanel";
import { NavbarPageBreadcrumbs } from "./NavbarPageBreadcrumbs";
import { NotificationDropdown } from "./NotificationDropdown";
import { VersionBadge } from "./VersionBadge";

const getFormattedSupportEmailLink = (variables: {
  org_id: string;
  domain: string;
  root_org_id?: string;
}) => {
  const email = "support@infisical.com";

  const body = `Hello Infisical Support Team,

Issue Details:
[What you did]
[What you expected to happen]
[What actually happened]
[Any error request IDs]
[Any supporting screenshots or video recording of the issue/request at hand]

Account Info:
- Organization ID: ${variables.org_id}
${variables.root_org_id ? `- Root Organization ID: ${variables.root_org_id}` : ""}
- Domain: ${variables.domain}

Thank you,
[Your Name]`;

  return `mailto:${email}?body=${encodeURIComponent(body)}`;
};

export const INFISICAL_SUPPORT_OPTIONS = [
  [MessagesSquare, "Support Forum", () => "https://community.infisical.com"],
  [
    Book,
    "Read Docs",
    () => "https://infisical.com/docs/documentation/getting-started/introduction"
  ],
  [Github, "GitHub Issues", () => "https://github.com/Infisical/infisical/issues"],
  [Mail, "Email Support", getFormattedSupportEmailLink],
  [Users, "Instance Admins", () => "server-admins"]
] as const;

const SUPPORT_OPTION_LABELS = {
  "Support Forum": "지원 포럼",
  "Read Docs": "문서",
  "GitHub Issues": "GitHub 이슈",
  "Email Support": "이메일 지원",
  "Instance Admins": "서버 관리자"
} as const;

export const Navbar = () => {
  const { user } = useUser();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { subscription } = useSubscription();
  const { currentOrg, isSubOrganization } = useOrganization();
  const { config: serverConfig } = useServerConfig();

  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [showSubOrgForm, setShowSubOrgForm] = useState(false);
  const [showCardDeclinedModal, setShowCardDeclinedModal] = useState(false);

  const subOrgQuery = subOrganizationsQuery.list({ isAccessible: true });
  const { data: subOrganizations = [] } = useQuery({
    ...subOrgQuery,
    enabled: Boolean(subscription.subOrganization),
    select: (data) => data.organizations
  });

  const isCardDeclined = Boolean(subscription?.cardDeclined);
  const isCardDeclinedMoreThan30Days = Boolean(
    isCardDeclined && subscription?.cardDeclinedDays && subscription?.cardDeclinedDays >= 30
  );

  const { data: orgs } = useGetOrganizations();
  const navigate = useNavigate();
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const queryClient = useQueryClient();
  const [isOrgSelectOpen, setIsOrgSelectOpen] = useState(false);

  const location = useLocation();
  const isBillingPage = location.pathname === `/organizations/${currentOrg.id}/billing`;

  const isModalIntrusive = Boolean(!isBillingPage && isCardDeclinedMoreThan30Days);

  const rootOrg = isSubOrganization
    ? orgs?.find((org) => org.id === currentOrg.rootOrgId) || currentOrg
    : currentOrg;

  const otherOrgs = orgs?.filter((org) => org.id !== rootOrg.id) ?? [];

  useEffect(() => {
    if (isModalIntrusive) {
      setShowCardDeclinedModal(true);
      sessionStorage.setItem("paymentFailed", "true");
      return;
    }

    if (isCardDeclined && !sessionStorage.getItem("paymentFailed")) {
      sessionStorage.setItem("paymentFailed", "true");
      setShowCardDeclinedModal(true);
    }
  }, [subscription, isBillingPage, isModalIntrusive]);

  const handleOrgSelection = async ({
    organizationId,
    navigateTo,
    isSubOrganization: targetIsSubOrganization = false,
    onSuccess
  }: {
    organizationId?: string;
    navigateTo?: string;
    isSubOrganization?: boolean;
    onSuccess?: () => void | Promise<void>;
  }) => {
    if (!organizationId) return;

    if (organizationId === currentOrg.id) return;

    const { token, isMfaEnabled, mfaMethod } = await selectOrganization({ organizationId });

    if (isMfaEnabled) {
      SecurityClient.setMfaToken(token);
      if (mfaMethod) {
        setRequiredMfaMethod(mfaMethod);
      }
      toggleShowMfa.on();
      setMfaSuccessCallback(() => async () => {
        await handleOrgSelection({
          organizationId,
          navigateTo,
          isSubOrganization: targetIsSubOrganization,
          onSuccess
        });
      });
      return;
    }

    SecurityClient.setToken(token);
    await queryClient.fetchQuery({
      queryKey: authKeys.getAuthToken,
      queryFn: fetchAuthToken,
      staleTime: 0
    });

    await navigateUserToOrg({
      navigate,
      organizationId,
      navigateTo,
      switchFrom: location,
      isSubOrganization: targetIsSubOrganization
    });

    if (onSuccess) {
      await onSuccess();
    }
  };

  const handleNavigateToRootOrgBilling = async () => {
    const navigateToBilling = () => {
      navigate({
        to: "/organizations/$orgId/billing",
        params: { orgId: rootOrg.id }
      });
    };

    const onSuccess = () => {
      setShowCardDeclinedModal(false);
    };

    if (isSubOrganization) {
      await handleOrgSelection({
        organizationId: rootOrg.id,
        navigateTo: "/organizations/$orgId/billing",
        onSuccess
      });
    } else {
      await navigateToBilling();
    }
  };

  const handleNavigateToAdminConsole = async () => {
    const navigateToAdminConsole = () => {
      navigate({
        to: "/admin"
      });
    };

    if (isSubOrganization) {
      await handleOrgSelection({ organizationId: rootOrg.id, navigateTo: "/admin" });
    } else {
      navigateToAdminConsole();
    }
  };

  const logout = useLogoutUser();
  const logOutUser = async () => {
    try {
      await logout.mutateAsync();
      navigate({ to: "/login" });
    } catch (error) {
      console.error(error);
    }
  };

  const handleCopyToken = async () => {
    try {
      await window.navigator.clipboard.writeText(getAuthToken());
      createNotification({
        type: "success",
        text: "현재 로그인 세션 토큰을 클립보드에 복사했습니다."
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "세션 토큰을 복사하지 못했습니다. 클립보드 권한을 확인하세요."
      });
    }
  };

  if (shouldShowMfa) {
    return (
      <Mfa
        email={user.email as string}
        method={requiredMfaMethod}
        successCallback={mfaSuccessCallback}
        closeMfa={() => toggleShowMfa.off()}
      />
    );
  }

  const isServerAdminPanel = location.pathname.startsWith("/admin");

  const orgScopedProduct = getOrgScopedProductFromPath(location.pathname);
  const isPamScope = orgScopedProduct === ProjectType.PAM;
  const isAgentVaultScope = orgScopedProduct === ProjectType.AgentVault;
  const isProjectScope =
    Boolean(orgScopedProduct) ||
    (location.pathname.startsWith(`/organizations/${currentOrg.id}/projects`) &&
      location.pathname !== `/organizations/${currentOrg.id}/projects`);

  const handleOrgNav = async (org: Organization) => {
    if (currentOrg?.id === org.id) return;

    if (org.authEnforced) {
      // org has an org-level auth method enabled (e.g. SAML)
      // -> logout + redirect to SAML SSO

      await logout.mutateAsync();
      if (org.orgAuthMethod === AuthMethod.OIDC) {
        // orgSlug, not domain: the domain param is a verified email-domain lookup and 403s on a slug
        window.open(`/api/v1/sso/oidc/login?orgSlug=${org.slug}`);
      } else {
        window.open(`/api/v1/sso/redirect/saml2/organizations/${org.slug}`);
      }
      window.close();
      return;
    }

    if (org.googleSsoAuthEnforced) {
      await logout.mutateAsync();
      window.open(`/api/v1/sso/redirect/google?org_slug=${org.slug}`);
      window.close();
      return;
    }

    handleOrgSelection({ organizationId: org?.id });
  };

  return (
    <div
      className={twMerge(
        "z-10 flex min-h-12 items-center border-b border-border-soft bg-background bg-gradient-to-br to-transparent in-data-[theme=light]:bg-none",
        isServerAdminPanel && "from-admin/5",
        !isServerAdminPanel && isPamScope && "from-product-pam/5",
        !isServerAdminPanel && isAgentVaultScope && "from-product-av/5",
        !isServerAdminPanel &&
          isProjectScope &&
          !isPamScope &&
          !isAgentVaultScope &&
          "from-project/5",
        !isServerAdminPanel && !isProjectScope && isSubOrganization && "from-sub-org/5",
        !isServerAdminPanel && !isProjectScope && !isSubOrganization && "from-org/5"
      )}
    >
      <SidebarTrigger variant="ghost" className="ml-2 lg:hidden" />
      <Link
        to="/organizations/$orgId/api-vault"
        params={{ orgId: currentOrg.id }}
        aria-label="Keydesk API 보관함"
        className="hidden shrink-0 items-center border-r border-border px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
      >
        <PersonalBrand />
      </Link>
      <div className="mr-auto flex h-full min-w-34 items-center">
        {isServerAdminPanel ? (
          <div className="flex h-full items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/organizations/$orgId/projects"
                  params={{ orgId: currentOrg.id }}
                  className="flex h-full items-center gap-x-1 border-r border-border-soft pr-4 pl-2 text-muted transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                  <OrgIcon className="size-3.5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">조직으로 돌아가기</TooltipContent>
            </Tooltip>
            <Link
              to="/admin"
              className="group flex cursor-pointer items-center gap-2 pl-4 text-sm text-foreground-inverse transition-all duration-100"
            >
              <InstanceIcon className="size-3.5 text-admin" />
              <div className="whitespace-nowrap">서버 관리</div>
            </Link>
          </div>
        ) : (
          <>
            <NavbarBlock
              className={twMerge(
                "overflow-hidden transition-all duration-300 ease-in-out",
                isProjectScope ? "max-w-52" : "max-w-96"
              )}
            >
              <NavbarSwitcher open={isOrgSelectOpen} onOpenChange={setIsOrgSelectOpen}>
                <div className="group flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden text-sm text-foreground transition-all duration-100">
                  <button
                    className="flex cursor-pointer items-center gap-x-2 truncate whitespace-nowrap"
                    type="button"
                    onClick={() => {
                      navigate({
                        to: "/organizations/$orgId/projects",
                        params: { orgId: currentOrg.id }
                      });
                    }}
                  >
                    {isSubOrganization ? (
                      <SubOrgIcon
                        className={twMerge(
                          "size-[14px] shrink-0",
                          !isProjectScope ? "text-sub-org" : "text-muted"
                        )}
                      />
                    ) : (
                      <OrgIcon
                        className={twMerge(
                          "size-[14px] shrink-0",
                          !isProjectScope ? "text-org" : "text-muted"
                        )}
                      />
                    )}

                    <span className="truncate">
                      {isSubOrganization ? currentOrg?.name : rootOrg?.name}
                    </span>
                    {!isProjectScope && (
                      <Badge
                        variant={isSubOrganization ? "sub-org" : "org"}
                        className="hidden lg:inline-flex"
                      >
                        {isSubOrganization ? "하위 조직" : "조직"}
                      </Badge>
                    )}
                  </button>
                  {subscription.cardDeclined && !isProjectScope && !isSubOrganization && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <TriangleAlertIcon className="size-3.5 animate-pulse cursor-help text-warning" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        결제를 처리하지 못했습니다
                        {subscription.cardDeclinedReason
                          ? `: ${subscription.cardDeclinedReason}`
                          : ""}
                        . 유료 기능을 계속 사용하려면 결제 수단을 확인하세요.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <NavbarSwitcherTrigger aria-label="조직 전환" />
                <NavbarSwitcherContent className="w-96">
                  <Command>
                    <CommandInput aria-label="조직 검색" placeholder="조직 검색…" />
                    <CommandList>
                      <CommandEmpty>검색한 조직이 없습니다.</CommandEmpty>
                      {/* Current Organization */}
                      <CommandGroup heading="현재 조직">
                        <CommandItem
                          value={rootOrg.id}
                          keywords={[rootOrg.name]}
                          onSelect={() => {
                            setIsOrgSelectOpen(false);
                            if (isSubOrganization) {
                              handleOrgSelection({ organizationId: rootOrg.id });
                            } else {
                              navigate({
                                to: "/organizations/$orgId/projects",
                                params: { orgId: rootOrg.id }
                              });
                            }
                          }}
                        >
                          <Check className={!isSubOrganization ? "opacity-100" : "opacity-0"} />
                          <span className="truncate">{rootOrg.name}</span>
                        </CommandItem>
                      </CommandGroup>
                      {/* Sub-Organizations */}
                      {subscription.subOrganization && (
                        <>
                          <CommandGroup
                            className="mb-3 ml-4.5 border-l border-border pt-0 pl-3 [&_[cmdk-group-heading]]:pt-0"
                            heading={
                              <div className="flex items-center justify-between">
                                <span>하위 조직</span>
                                <OrgPermissionCan
                                  I={OrgPermissionSubOrgActions.Edit}
                                  a={OrgPermissionSubjects.SubOrganization}
                                >
                                  {(isAllowed) =>
                                    isAllowed ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <IconButton
                                            variant="ghost-muted"
                                            size="xs"
                                            aria-label="하위 조직 설정"
                                            className="-mr-1 size-5"
                                            onClick={() => {
                                              setIsOrgSelectOpen(false);
                                              navigate({
                                                to: "/organizations/$orgId/settings",
                                                params: { orgId: rootOrg.id },
                                                search: { selectedTab: "tab-sub-organizations" }
                                              });
                                            }}
                                          >
                                            <Settings className="size-3.5!" />
                                          </IconButton>
                                        </TooltipTrigger>
                                        <TooltipContent>하위 조직 설정</TooltipContent>
                                      </Tooltip>
                                    ) : null
                                  }
                                </OrgPermissionCan>
                              </div>
                            }
                          >
                            {subOrganizations.map((subOrg) => (
                              <CommandItem
                                key={subOrg.id}
                                value={subOrg.id}
                                keywords={[subOrg.name]}
                                onSelect={() => {
                                  setIsOrgSelectOpen(false);
                                  handleOrgSelection({
                                    organizationId: subOrg.id,
                                    isSubOrganization: true
                                  });
                                }}
                              >
                                <Check
                                  className={
                                    currentOrg?.id === subOrg.id ? "opacity-100" : "opacity-0"
                                  }
                                />
                                <span className="truncate">{subOrg.name}</span>
                              </CommandItem>
                            ))}
                            <OrgPermissionCan
                              I={OrgPermissionSubOrgActions.Create}
                              a={OrgPermissionSubjects.SubOrganization}
                            >
                              {(isAllowed) =>
                                isAllowed && !isSubOrganization ? (
                                  <CommandItem
                                    className="text-muted"
                                    onSelect={() => {
                                      setIsOrgSelectOpen(false);
                                      setShowSubOrgForm(true);
                                    }}
                                  >
                                    <Plus />
                                    <span>하위 조직 만들기</span>
                                  </CommandItem>
                                ) : null
                              }
                            </OrgPermissionCan>
                          </CommandGroup>
                          {otherOrgs.length > 0 && <CommandSeparator />}
                        </>
                      )}
                      {/* Other Organizations */}
                      {otherOrgs.length > 0 && (
                        <CommandGroup heading="다른 조직">
                          {otherOrgs.map((org) => (
                            <CommandItem
                              key={org.id}
                              value={org.id}
                              keywords={[org.name]}
                              onSelect={() => {
                                setIsOrgSelectOpen(false);
                                handleOrgNav(org);
                              }}
                            >
                              <span className="truncate">{org.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                    <CommandSeparator />
                    <div className="p-1">
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-foreground/5"
                        onClick={logOutUser}
                      >
                        <LogOut className="size-4" />
                        <span>로그아웃</span>
                      </button>
                    </div>
                  </Command>
                </NavbarSwitcherContent>
              </NavbarSwitcher>
            </NavbarBlock>
            {isProjectScope && (
              <>
                <TypeSelect />
                <ProjectSelect />
                <ApplicationSelect />
              </>
            )}
            <NavbarPageBreadcrumbs />
          </>
        )}
      </div>

      <VersionBadge />
      {!location.pathname.startsWith("/admin") && user.superAdmin && (
        <Button variant="outline" size="xs" className="mt-px mr-2" asChild>
          <Link to="/admin" onClick={handleNavigateToAdminConsole}>
            <InstanceIcon />
            <span className="hidden md:inline">서버 관리</span>
          </Link>
        </Button>
      )}
      {!location.pathname.startsWith("/admin") && !user.superAdmin && (
        <OrgPermissionCan I={OrgPermissionMemberActions.Create} a={OrgPermissionSubjects.Member}>
          {(isAllowed) =>
            isAllowed ? (
              <Button variant="outline" size="sm" className="mr-2" asChild>
                <Link
                  to="/organizations/$orgId/access-management"
                  params={{ orgId: currentOrg.id }}
                  search={{
                    selectedTab: "members",
                    action: "invite-members"
                  }}
                >
                  <UserPlus />
                  <span className="hidden md:inline">사용자 초대</span>
                </Link>
              </Button>
            ) : null
          }
        </OrgPermissionCan>
      )}
      <ButtonGroup className="mr-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton variant="outline" size="sm" aria-label="도움말">
              <CircleHelp />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            {INFISICAL_SUPPORT_OPTIONS.map(([Icon, text, getUrl]) => {
              const url =
                text === "Email Support"
                  ? getUrl({
                      org_id: currentOrg.id,
                      domain: window.location.origin,
                      ...(isSubOrganization && { root_org_id: rootOrg.id })
                    })
                  : getUrl();

              if (url === "server-admins" && isInfisicalCloud()) {
                return null;
              }
              if (url === "server-admins") {
                return (
                  <DropdownMenuItem key="server-admins" onSelect={() => setShowAdminsModal(true)}>
                    <Icon className="size-4" />
                    {SUPPORT_OPTION_LABELS[text]}
                  </DropdownMenuItem>
                );
              }

              return (
                <DropdownMenuItem key={url as string} asChild>
                  <a target="_blank" rel="noopener noreferrer" href={String(url)}>
                    <Icon />
                    {SUPPORT_OPTION_LABELS[text]}
                  </a>
                </DropdownMenuItem>
              );
            })}
            {envConfig.PLATFORM_VERSION && (
              <>
                <DropdownMenuSeparator />
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted">
                  <Info className="size-3.5" />
                  버전: {envConfig.PLATFORM_VERSION}
                  {serverConfig.latestAvailableVersion && (
                    <a
                      href="https://upgrade.infisical.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-info hover:underline"
                    >
                      (v{serverConfig.latestAvailableVersion} 사용 가능)
                    </a>
                  )}
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <AnnouncementNavButton />
        <NotificationDropdown />
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              aria-label={`${resolvedTheme === "dark" ? "밝은" : "어두운"} 테마로 변경`}
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark", "navbar-toggle")}
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {resolvedTheme === "dark" ? "밝은" : "어두운"} 테마로 변경
          </TooltipContent>
        </Tooltip>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton variant="outline" size="sm" aria-label="사용자 메뉴">
              <User />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="end"
            className="[&_[data-slot=dropdown-menu-item]]:h-9 [&_[data-slot=dropdown-menu-radio-item]]:h-9"
          >
            <div className="cursor-default px-3 py-2">
              <div className="text-sm font-medium capitalize">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-muted-foreground text-xs">{user.email}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/personal-settings">
                <Settings className="size-4" />
                개인 설정
              </Link>
            </DropdownMenuItem>
            <OrgPermissionCan
              I={OrgPermissionMemberActions.Create}
              a={OrgPermissionSubjects.Member}
            >
              {(isAllowed) =>
                isAllowed ? (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/organizations/$orgId/access-management"
                      params={{ orgId: currentOrg.id }}
                      search={{
                        selectedTab: "members",
                        action: "invite-members"
                      }}
                    >
                      <UserPlus />
                      사용자 초대
                    </Link>
                  </DropdownMenuItem>
                ) : null
              }
            </OrgPermissionCan>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>테마</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => setTheme(value as Theme, "profile-menu")}
            >
              <DropdownMenuRadioItem value="system" className="gap-2">
                <Monitor className="size-4" />
                시스템 설정
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="gap-2">
                <Moon className="size-4" />
                어둡게
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light" className="gap-2">
                <Sun className="size-4" />
                밝게
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a
                href="https://infisical.com/docs/documentation/getting-started/introduction"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Book />
                문서
                <ExternalLink className="ml-auto size-3.5 opacity-50" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="https://community.infisical.com" target="_blank" rel="noopener noreferrer">
                <MessagesSquare />
                커뮤니티
                <ExternalLink className="ml-auto size-3.5 opacity-50" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleCopyToken}>
              <Clipboard />
              세션 토큰 복사
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-3.5 opacity-50" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  현재 로그인 세션에 연결된 토큰입니다. 현재 로그인한 조직의 리소스에만 접근할 수
                  있습니다.
                </TooltipContent>
              </Tooltip>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logOutUser}>
              <LogOut />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      <Dialog
        open={showCardDeclinedModal}
        onOpenChange={(isOpen) => {
          if (!isModalIntrusive) setShowCardDeclinedModal(isOpen);
        }}
      >
        <DialogContent showCloseButton={!isModalIntrusive}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-lg text-warning" />
              결제를 처리하지 못했습니다.
            </DialogTitle>
            <DialogDescription>
              최근 결제를 처리하지 못했습니다
              {subscription.cardDeclinedReason ? `: ${subscription.cardDeclinedReason}` : ""}. 유료
              기능을 계속 사용하려면 결제 정보를 확인하세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {!isModalIntrusive && (
              <Button variant="outline" onClick={() => setShowCardDeclinedModal(false)}>
                닫기
              </Button>
            )}
            <Button variant="org" onClick={handleNavigateToRootOrgBilling}>
              결제 수단 수정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <NewSubOrganizationModal
        isOpen={showSubOrgForm}
        onOpenChange={setShowSubOrgForm}
        onCreated={({ id }) => handleOrgSelection({ organizationId: id, isSubOrganization: true })}
      />
      <Dialog open={showAdminsModal} onOpenChange={setShowAdminsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>서버 관리자</DialogTitle>
            <DialogDescription>이 서버의 관리자 목록을 확인하세요.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col overflow-visible">
            <ServerAdminsPanel />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
};
