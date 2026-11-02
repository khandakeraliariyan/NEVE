import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { idOf } from "../../lib/format";

// Loads one agreement and works out what the signed-in user may do with it.
export function useAgreement(agreementId) {
    const { profile } = useAuth();
    const result = useApi(() => api.get(`/tenancy/agreements/${agreementId}`), [agreementId]);
    const agreement = result.data?.data ?? null;
    const me = String(profile?._id ?? "");
    const isRenter = agreement && String(idOf(agreement.renter)) === me;
    const isLandlord = agreement && String(idOf(agreement.landlord)) === me;
    const isManager = agreement && String(idOf(agreement.assignedPropertyManager)) === me;

    return {
        ...result,
        agreement,
        isParticipant: Boolean(isRenter || isLandlord),
        isManager: Boolean(isManager),
        myParty: isRenter ? "renter" : isLandlord ? "landlord" : null,
        readOnly: !isRenter && !isLandlord && !isManager,
    };
}
